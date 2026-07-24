import { request } from '@playwright/test';
import { loginWithMfaViaApi } from './auth-api';
import {
  APP_USER_STATE_PATH,
  ensureAuthDir,
  writeRuntimeTestUserState,
} from './runtime-test-user';
import { buildApiStorageState } from './staging-auth';

export type FixtureUserCreds = {
  email: string;
  username: string;
  password: string;
  mfaSecret: string;
};

export function readFixtureUserFromEnv(): FixtureUserCreds {
  const email = process.env.FIXTURE_USER_EMAIL;
  const username = process.env.FIXTURE_USER_USERNAME;
  const password = process.env.FIXTURE_USER_PASSWORD;
  const mfaSecret = process.env.FIXTURE_USER_MFA_SECRET;

  if (!email || !username || !password || !mfaSecret) {
    throw new Error(
      'USE_FIXTURE_USER=1 ist gesetzt, aber FIXTURE_USER_EMAIL/USERNAME/PASSWORD/MFA_SECRET fehlen. ' +
        'Provisioniere User mit `npm run provision:fixture-users -- <role>` und setze die ausgegebenen Werte als GitHub Secrets.',
    );
  }

  return { email, username, password, mfaSecret };
}

export async function setupFixtureTestUser(baseURL: string): Promise<void> {
  ensureAuthDir();
  const creds = readFixtureUserFromEnv();
  const ctx = await request.newContext({ baseURL, storageState: buildApiStorageState(baseURL) });

  try {
    try {
      await loginWithMfaViaApi(ctx, creds);
    } catch (error) {
      throw new Error(
        `Fixture-User-Login fehlgeschlagen (${creds.email}) — wurde der User via ` +
          `provision:fixture-users mit MFA provisioniert? Ursache: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
    await ctx.storageState({ path: APP_USER_STATE_PATH });
  } finally {
    await ctx.dispose();
  }

  const now = new Date().toISOString();
  writeRuntimeTestUserState({
    status: 'ready',
    baseURL,
    user: {
      email: creds.email,
      username: creds.username,
      password: creds.password,
      mfaSecret: creds.mfaSecret,
      createdAt: now,
      verifiedAt: now,
      mfaEnabledAt: now,
    },
  });
}
