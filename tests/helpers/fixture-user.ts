import * as fs from 'fs';
import { request } from '@playwright/test';
import {
  APP_USER_STATE_PATH,
  ensureAuthDir,
  STAGING_STATE_PATH,
  writeRuntimeTestUserState,
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

export function buildApiStorageState(baseURL: string): StorageState {
  const state = JSON.parse(fs.readFileSync(STAGING_STATE_PATH, 'utf-8')) as StorageState;
  const hostname = new URL(baseURL).hostname;

  return {
    ...state,
    cookies: [
      ...state.cookies.filter((c) => c.name !== 'CAPTCHA_BYPASS'),
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

export async function setupFixtureTestUser(baseURL: string): Promise<void> {
  ensureAuthDir();
  const creds = readFixtureUserFromEnv();
  const storageState = buildApiStorageState(baseURL);

  const ctx = await request.newContext({ baseURL, storageState });

  try {
    const loginRes = await ctx.post('/api/v1/auth/login?tokenMode=COOKIE', {
      data: { email: creds.email, password: creds.password, captchaToken: 'BYPASS' },
    });

    if (!loginRes.ok()) {
      throw new Error(
        `Fixture-User-Login fehlgeschlagen (${creds.email}): ${loginRes.status()} ${await loginRes.text()}`,
      );
    }

    const loginBody = (await loginRes.json()) as {
      mfaRequired?: boolean;
      challengeToken?: string;
    };

    if (!loginBody.mfaRequired || !loginBody.challengeToken) {
      throw new Error(
        `Fixture-User-Login lieferte keine MFA-Challenge — wurde der User via provision:fixture-users mit MFA versehen? Antwort: ${JSON.stringify(loginBody)}`,
      );
    }

    const challengeRes = await ctx.post('/api/v1/auth/mfa/challenge?tokenMode=COOKIE', {
      data: {
        challengeToken: loginBody.challengeToken,
        totpCode: generateTotpCode(creds.mfaSecret),
      },
    });

    if (!challengeRes.ok()) {
      throw new Error(
        `Fixture-User MFA-Challenge fehlgeschlagen: ${challengeRes.status()} ${await challengeRes.text()}`,
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
