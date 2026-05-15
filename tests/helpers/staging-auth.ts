import * as fs from 'fs';
import { request } from '@playwright/test';
import { ensureAuthDir, STAGING_STATE_PATH } from './runtime-test-user';

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

const EMPTY_STATE: StorageState = { cookies: [], origins: [] };

/**
 * Schreibt `.auth/state.json` mit gültigem Staging-Barrier-Cookie.
 * Wenn STAGING_AUTH_USERNAME/PASSWORD nicht gesetzt sind, wird ein leerer State geschrieben
 * (lokales Setup ohne Barrier).
 */
export async function setupStagingBarrier(opts: {
  baseURL: string;
  username?: string;
  password?: string;
}): Promise<void> {
  const { baseURL, username, password } = opts;
  ensureAuthDir();

  if (!username || !password) {
    fs.writeFileSync(STAGING_STATE_PATH, JSON.stringify(EMPTY_STATE));
    return;
  }

  const ctx = await request.newContext({ baseURL });
  try {
    const creds = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await ctx.post('/api/v1/staging-auth', {
      headers: { Authorization: `Basic ${creds}` },
    });
    if (!res.ok()) {
      throw new Error(`Staging-Auth fehlgeschlagen: ${res.status()} ${await res.text()}`);
    }
    await ctx.storageState({ path: STAGING_STATE_PATH });
  } finally {
    await ctx.dispose();
  }
}

export function readStagingStorageState(): StorageState {
  if (!fs.existsSync(STAGING_STATE_PATH)) {
    return EMPTY_STATE;
  }
  try {
    return JSON.parse(fs.readFileSync(STAGING_STATE_PATH, 'utf-8')) as StorageState;
  } catch {
    return EMPTY_STATE;
  }
}
