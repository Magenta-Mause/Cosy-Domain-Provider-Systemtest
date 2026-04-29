import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STATE_PATH = '.auth/state.json';

export default async function globalSetup() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

  const username = process.env.STAGING_AUTH_USERNAME;
  const password = process.env.STAGING_AUTH_PASSWORD;
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  if (!username || !password) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const ctx = await request.newContext({ baseURL });
  const creds = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await ctx.post('/api/v1/staging-auth', {
    headers: { Authorization: `Basic ${creds}` },
  });

  if (!res.ok()) {
    throw new Error(`Staging-Auth fehlgeschlagen: ${res.status()} ${await res.text()}`);
  }

  await ctx.storageState({ path: STATE_PATH });
  await ctx.dispose();
}
