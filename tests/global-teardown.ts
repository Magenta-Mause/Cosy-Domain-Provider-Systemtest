import { request } from '@playwright/test';
import * as fs from 'fs';
import {
  APP_USER_STATE_PATH,
  readCleanupUsers,
  removeCleanupUser,
  STAGING_STATE_PATH,
  TEST_USER_STATE_PATH,
} from './helpers/runtime-test-user';
import { generateTotpCode } from './helpers/totp';

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

export default async function globalTeardown() {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';
  const users = readCleanupUsers();
  const failures: string[] = [];

  for (const user of users) {
    try {
      await deleteUser(baseURL, user);
      removeCleanupUser(user.email);
    } catch (error) {
      failures.push(
        `${user.email} (${user.source}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  clearRuntimeAuthState();

  if (failures.length > 0) {
    console.warn(`Testuser-Cleanup unvollständig:\n${failures.join('\n')}`);
  }
}

async function deleteUser(
  baseURL: string,
  user: { email: string; password: string; mfaSecret?: string },
) {
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
      extraHTTPHeaders: {
        Authorization: `Bearer ${identityToken}`,
      },
    });
    try {
      const deleteRes = await deleteCtx.delete('/api/v1/user');
      if (!deleteRes.ok() && deleteRes.status() !== 404) {
        throw new Error(`Delete fehlgeschlagen: ${deleteRes.status()} ${await deleteRes.text()}`);
      }
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

function clearRuntimeAuthState() {
  for (const path of [APP_USER_STATE_PATH, TEST_USER_STATE_PATH]) {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  }
}
