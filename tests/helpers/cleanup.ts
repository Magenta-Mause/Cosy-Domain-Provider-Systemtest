import * as fs from 'fs';
import { request } from '@playwright/test';
import {
  deleteUserAsAdmin,
  findAdminUserByEmail,
  getAdminKey,
} from './admin-cleanup';
import {
  type CleanupTestUser,
  STAGING_STATE_PATH,
  readCleanupUsers,
  recordCleanupFailure,
  removeCleanupUser,
} from './runtime-test-user';
import { generateTotpCode } from './totp';

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
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
};

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

type DeletionOutcome =
  | { kind: 'deleted' }
  | { kind: 'failed'; reason: string; attempts: number };

/**
 * Löscht alle Einträge in cleanup-users.json. Erfolg → Eintrag entfernt.
 * Permanente Fehler (nach Retries) → cleanup-failures.json + Eintrag entfernt.
 */
export async function processCleanupQueue(baseURL: string): Promise<{
  deleted: string[];
  failed: Array<{ email: string; reason: string }>;
}> {
  const users = readCleanupUsers();
  const deleted: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const user of users) {
    const outcome = await cleanupSingleUserWithRetries(baseURL, user);
    if (outcome.kind === 'deleted') {
      removeCleanupUser(user.email);
      deleted.push(user.email);
    } else {
      recordCleanupFailure({
        ...user,
        failedAt: new Date().toISOString(),
        reason: outcome.reason,
        attempts: outcome.attempts,
      });
      removeCleanupUser(user.email);
      failed.push({ email: user.email, reason: outcome.reason });
    }
  }

  return { deleted, failed };
}

async function cleanupSingleUserWithRetries(
  baseURL: string,
  user: CleanupTestUser,
): Promise<DeletionOutcome> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await cleanupSingleUser(baseURL, user);
      return { kind: 'deleted' };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  return { kind: 'failed', reason: lastError, attempts: MAX_ATTEMPTS };
}

async function cleanupSingleUser(baseURL: string, user: CleanupTestUser): Promise<void> {
  const adminKey = getAdminKey();

  // Bevorzugt: admin-delete (kein Login, kein MFA nötig).
  if (adminKey) {
    const adminUser = await findAdminUserByEmail(baseURL, adminKey, user.email);
    if (!adminUser) {
      // User existiert nicht mehr → erledigt.
      return;
    }
    const result = await deleteUserAsAdmin(baseURL, adminUser.uuid, adminKey);
    if (result === 'deleted' || result === 'notfound') return;
    throw new Error(`Admin-Delete für ${user.email} hatte unerwartetes Ergebnis: ${result}`);
  }

  // Fallback: Self-Delete via Login.
  await deleteUserViaSelfLogin(baseURL, user);
}

async function deleteUserViaSelfLogin(baseURL: string, user: CleanupTestUser): Promise<void> {
  const storageState = createCleanupStorageState(baseURL);
  const ctx = await request.newContext({ baseURL, storageState });

  try {
    const loginRes = await ctx.post('/api/v1/auth/login?tokenMode=COOKIE', {
      data: {
        email: user.email,
        password: user.password,
        captchaToken: 'BYPASS',
      },
    });

    if (loginRes.status() === 401 || loginRes.status() === 404) {
      // User existiert nicht (mehr) oder Credentials passen nicht → als erledigt verbuchen.
      return;
    }

    if (!loginRes.ok()) {
      throw new Error(`Login fehlgeschlagen: ${loginRes.status()} ${await loginRes.text()}`);
    }

    const loginBody = (await loginRes.json()) as {
      mfaRequired?: boolean;
      challengeToken?: string;
    };

    if (loginBody.mfaRequired) {
      if (!user.mfaSecret || !loginBody.challengeToken) {
        throw new Error('MFA erforderlich, aber Secret oder Challenge-Token fehlt');
      }
      const challengeRes = await ctx.post('/api/v1/auth/mfa/challenge?tokenMode=COOKIE', {
        data: {
          challengeToken: loginBody.challengeToken,
          totpCode: generateTotpCode(user.mfaSecret),
        },
      });
      if (!challengeRes.ok()) {
        throw new Error(
          `MFA-Challenge fehlgeschlagen: ${challengeRes.status()} ${await challengeRes.text()}`,
        );
      }
    }

    const tokenRes = await ctx.get('/api/v1/auth/token');
    if (!tokenRes.ok()) {
      throw new Error(
        `Identity-Token konnte nicht geholt werden: ${tokenRes.status()} ${await tokenRes.text()}`,
      );
    }
    const identityToken = await tokenRes.text();

    const deleteCtx = await request.newContext({
      baseURL,
      storageState: await ctx.storageState(),
      extraHTTPHeaders: { Authorization: `Bearer ${identityToken}` },
    });
    try {
      const deleteRes = await deleteCtx.delete('/api/v1/user');
      if (deleteRes.status() === 204 || deleteRes.status() === 200 || deleteRes.status() === 404) {
        return;
      }
      throw new Error(`Delete fehlgeschlagen: ${deleteRes.status()} ${await deleteRes.text()}`);
    } finally {
      await deleteCtx.dispose();
    }
  } finally {
    await ctx.dispose();
  }
}

function createCleanupStorageState(baseURL: string): StorageState {
  const state = fs.existsSync(STAGING_STATE_PATH)
    ? (JSON.parse(fs.readFileSync(STAGING_STATE_PATH, 'utf-8')) as StorageState)
    : { cookies: [], origins: [] };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
