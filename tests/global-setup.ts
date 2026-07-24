import { chromium, request } from '@playwright/test';
import * as fs from 'fs';
import { deleteOrphanPlaywrightUsers, getAdminKey } from './helpers/admin-cleanup';
import {
  loginWithMfaViaApi,
  registerUser,
  setupMfaViaApi,
  triggerVerificationMail,
  waitForVerificationToken,
} from './helpers/auth-api';
import { processCleanupQueue } from './helpers/cleanup';
import { resolveBaseURL } from './helpers/constants';
import { setupFixtureTestUser } from './helpers/fixture-user';
import {
  APP_USER_STATE_PATH,
  clearCleanupFailures,
  ensureAuthDir,
  generateRuntimeTestUser,
  writeRuntimeTestUserState,
} from './helpers/runtime-test-user';
import { buildApiStorageState, setupStagingBarrier, type StorageState } from './helpers/staging-auth';

export default async function globalSetup() {
  ensureAuthDir();

  const username = process.env.STAGING_AUTH_USERNAME;
  const password = process.env.STAGING_AUTH_PASSWORD;
  const baseURL = resolveBaseURL();

  await setupStagingBarrier({ baseURL, username, password });
  // SKIP_CROSSRUN_CLEANUP=1 setzt der Monitor-Runner: er führt den (teuren, über alle
  // Staging-User scannenden) Cross-Run-Cleanup EINMAL zentral vor allen Suites aus,
  // statt ihn in jedem der 6 Suite-global-setups zu wiederholen.
  if (process.env.SKIP_CROSSRUN_CLEANUP !== '1') {
    await preRunCleanup(baseURL);
  }
  if (process.env.SKIP_APP_TEST_USER_SETUP === '1') {
    writeRuntimeTestUserState({
      status: 'skipped',
      baseURL,
      createdAt: new Date().toISOString(),
      error: 'App-Testuser-Setup wurde per SKIP_APP_TEST_USER_SETUP=1 übersprungen.',
    });
    clearAuthenticatedAppState();
    return;
  }
  if (process.env.USE_FIXTURE_USER === '1') {
    clearAuthenticatedAppState();
    await setupFixtureTestUser(baseURL);
    return;
  }
  await setupRuntimeTestUser(baseURL);
}

async function preRunCleanup(baseURL: string) {
  clearCleanupFailures();

  try {
    const queueResult = await processCleanupQueue(baseURL);
    if (queueResult.deleted.length > 0) {
      console.log(
        `Pre-Run-Cleanup: ${queueResult.deleted.length} Karteileichen aus letztem Run gelöscht.`,
      );
    }
    if (queueResult.failed.length > 0) {
      const lines = queueResult.failed.map((f) => `  - ${f.email}: ${f.reason}`).join('\n');
      console.warn(
        `Pre-Run-Cleanup: ${queueResult.failed.length} permanente Fehler (siehe .auth/cleanup-failures.json):\n${lines}`,
      );
    }
  } catch (error) {
    console.warn(
      `Pre-Run-Cleanup (cleanup-users.json) übersprungen: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (getAdminKey()) {
    try {
      const orphanResult = await deleteOrphanPlaywrightUsers(baseURL);
      if (orphanResult.deleted.length > 0) {
        console.log(
          `Pre-Run-Cleanup (Admin-Scan): ${orphanResult.deleted.length} verwaiste Playwright-User gelöscht.`,
        );
      }
      if (orphanResult.failed.length > 0) {
        const lines = orphanResult.failed.map((f) => `  - ${f.email}: ${f.reason}`).join('\n');
        console.warn(
          `Pre-Run-Cleanup (Admin-Scan): ${orphanResult.failed.length} fehlgeschlagen:\n${lines}`,
        );
      }
    } catch (error) {
      console.warn(
        `Pre-Run-Cleanup (Admin-Scan) übersprungen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Legt den App-Testuser für den Lauf an: Register → Verify-Mail → Verify im Browser
 * → MFA per API → Login mit MFA. Der eingeloggte Browser-State landet in
 * `.auth/app-user-state.json`, die User-Daten in `.auth/test-user.json`.
 */
async function setupRuntimeTestUser(baseURL: string) {
  const createdAt = new Date();
  clearAuthenticatedAppState();

  if (!process.env.MAIL_SERVICE_API_KEY) {
    writeRuntimeTestUserState({
      status: 'skipped',
      baseURL,
      createdAt: createdAt.toISOString(),
      error: 'MAIL_SERVICE_API_KEY ist nicht gesetzt; App-Testuser kann nicht verifiziert werden.',
    });
    return;
  }

  const user = generateRuntimeTestUser();
  const ctx = await request.newContext({
    baseURL,
    storageState: buildApiStorageState(baseURL),
  });

  try {
    await registerUser(ctx, user, 'global-setup');
    await triggerVerificationMail(ctx);
    const verifyToken = await waitForVerificationToken(
      user.email,
      createdAt,
      Number(process.env.TEST_USER_SETUP_MAIL_TIMEOUT_MS ?? 45_000),
    );
    await verifyAccountInBrowser(baseURL, verifyToken, await ctx.storageState());

    const mfaSecret = await setupMfaViaApi(ctx, user.email);
    await loginWithMfaViaApi(ctx, { ...user, mfaSecret });
    await ctx.storageState({ path: APP_USER_STATE_PATH });

    writeRuntimeTestUserState({
      status: 'ready',
      baseURL,
      user: {
        ...user,
        mfaSecret,
        createdAt: createdAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        mfaEnabledAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    writeRuntimeTestUserState({
      status: 'failed',
      baseURL,
      createdAt: createdAt.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await ctx.dispose();
  }
}

function clearAuthenticatedAppState() {
  if (fs.existsSync(APP_USER_STATE_PATH)) {
    fs.unlinkSync(APP_USER_STATE_PATH);
  }
}

async function verifyAccountInBrowser(
  baseURL: string,
  token: string,
  storageState: StorageState,
) {
  const browser = await chromium.launch({
    headless: process.env.HEADED_SETUP !== '1',
    slowMo: Number(process.env.SLOW_MO_MS ?? 0) || undefined,
  });
  const context = await browser.newContext({
    baseURL,
    storageState,
  });
  const page = await context.newPage();

  try {
    await page.goto(`/verify?token=${token}`);
    await page.getByTestId('verify-success-message').waitFor({ timeout: 30_000 });
  } catch (error) {
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
    const details = bodyText.trim().replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(
      `Account-Verifizierung im Browser fehlgeschlagen: ${
        error instanceof Error ? error.message : String(error)
      }. URL: ${page.url()}. Seitentext: ${details}`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
