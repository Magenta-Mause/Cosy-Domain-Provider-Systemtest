import { chromium, request } from '@playwright/test';
import * as fs from 'fs';
import { deleteOrphanPlaywrightUsers, getAdminKey } from './helpers/admin-cleanup';
import { processCleanupQueue } from './helpers/cleanup';
import { MailService } from './helpers/mail-service';
import {
  APP_USER_STATE_PATH,
  clearCleanupFailures,
  ensureAuthDir,
  generateRuntimeTestUser,
  recordCleanupUser,
  STAGING_STATE_PATH,
  updateCleanupUser,
  writeRuntimeTestUserState,
} from './helpers/runtime-test-user';
import { setupStagingBarrier } from './helpers/staging-auth';
import { generateTotpCode } from './helpers/totp';

const VERIFY_MAIL_SUBJECT = 'Verify Your Account';

type StorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

export default async function globalSetup() {
  ensureAuthDir();

  const username = process.env.STAGING_AUTH_USERNAME;
  const password = process.env.STAGING_AUTH_PASSWORD;
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  await setupStagingBarrier({ baseURL, username, password });
  await preRunCleanup(baseURL);
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
  recordCleanupUser({
    email: user.email,
    password: user.password,
    source: 'global-setup',
    createdAt: createdAt.toISOString(),
  });
  const ctx = await request.newContext({
    baseURL,
    storageState: createRuntimeApiStorageState(baseURL),
  });

  try {
    const registerRes = await ctx.post('/api/v1/auth/register?tokenMode=COOKIE', {
      data: { ...user, captchaToken: 'BYPASS' },
    });

    if (registerRes.status() !== 201) {
      throw new Error(
        `Registrierung fehlgeschlagen: ${registerRes.status()} ${await registerRes.text()}`,
      );
    }
    const verificationStorageState = await ctx.storageState();

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: user.email,
      subjectContains: VERIFY_MAIL_SUBJECT,
      after: createdAt,
      timeoutMs: Number(process.env.TEST_USER_SETUP_MAIL_TIMEOUT_MS ?? 45_000),
    });

    await verifyAccountInBrowser(
      baseURL,
      mail.extractVerifyToken(verifyMail),
      verificationStorageState,
    );
    const identityToken = await fetchIdentityToken(baseURL, verificationStorageState);
    const mfaSecret = await setupMfa(baseURL, verificationStorageState, identityToken);
    updateCleanupUser(user.email, { mfaSecret });
    await createAuthenticatedAppState(baseURL, user, mfaSecret, verificationStorageState);

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

function createRuntimeApiStorageState(baseURL: string): StorageState {
  const state = JSON.parse(fs.readFileSync(STAGING_STATE_PATH, 'utf-8')) as StorageState;
  const hostname = new URL(baseURL).hostname;

  return {
    ...state,
    cookies: [
      ...state.cookies.filter((cookie) => cookie.name !== 'CAPTCHA_BYPASS'),
      {
        name: 'CAPTCHA_BYPASS',
        value: '1',
        domain: hostname,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: baseURL.startsWith('https://'),
        sameSite: 'Lax',
      },
    ],
  };
}

async function createAuthenticatedAppState(
  baseURL: string,
  user: { email: string; password: string },
  mfaSecret: string,
  storageState: StorageState,
) {
  const ctx = await request.newContext({
    baseURL,
    storageState,
  });

  try {
    const loginRes = await ctx.post('/api/v1/auth/login?tokenMode=COOKIE', {
      data: {
        email: user.email,
        password: user.password,
        captchaToken: 'BYPASS',
      },
    });

    if (!loginRes.ok()) {
      throw new Error(`App-Login fehlgeschlagen: ${loginRes.status()} ${await loginRes.text()}`);
    }
    const loginBody = (await loginRes.json()) as {
      mfaRequired?: boolean;
      challengeToken?: string;
    };

    if (!loginBody.mfaRequired || !loginBody.challengeToken) {
      throw new Error(
        `App-Login hat keine MFA-Challenge geliefert: ${JSON.stringify(loginBody)}`,
      );
    }

    const challengeRes = await ctx.post('/api/v1/auth/mfa/challenge?tokenMode=COOKIE', {
      data: {
        challengeToken: loginBody.challengeToken,
        totpCode: generateTotpCode(mfaSecret),
      },
    });

    if (!challengeRes.ok()) {
      throw new Error(
        `MFA-Challenge fehlgeschlagen: ${challengeRes.status()} ${await challengeRes.text()}`,
      );
    }

    await ctx.storageState({ path: APP_USER_STATE_PATH });
  } finally {
    await ctx.dispose();
  }
}

async function fetchIdentityToken(baseURL: string, storageState: StorageState): Promise<string> {
  const ctx = await request.newContext({
    baseURL,
    storageState,
  });

  try {
    const tokenRes = await ctx.get('/api/v1/auth/token');
    if (!tokenRes.ok()) {
      throw new Error(
        `Identity-Token konnte nicht geholt werden: ${tokenRes.status()} ${await tokenRes.text()}`,
      );
    }

    return await tokenRes.text();
  } finally {
    await ctx.dispose();
  }
}

async function setupMfa(
  baseURL: string,
  storageState: StorageState,
  identityToken: string,
): Promise<string> {
  const ctx = await request.newContext({
    baseURL,
    storageState,
    extraHTTPHeaders: {
      Authorization: `Bearer ${identityToken}`,
    },
  });

  try {
    const setupRes = await ctx.post('/api/v1/auth/mfa/setup');
    if (!setupRes.ok()) {
      throw new Error(`MFA-Setup fehlgeschlagen: ${setupRes.status()} ${await setupRes.text()}`);
    }

    const setupBody = (await setupRes.json()) as {
      secret?: string;
      totpUri?: string;
    };

    if (!setupBody.secret) {
      throw new Error(`MFA-Setup lieferte kein Secret: ${JSON.stringify(setupBody)}`);
    }

    const confirmRes = await ctx.post('/api/v1/auth/mfa/confirm', {
      data: { totpCode: generateTotpCode(setupBody.secret) },
    });

    if (!confirmRes.ok()) {
      throw new Error(
        `MFA-Bestätigung fehlgeschlagen: ${confirmRes.status()} ${await confirmRes.text()}`,
      );
    }

    return setupBody.secret;
  } finally {
    await ctx.dispose();
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
