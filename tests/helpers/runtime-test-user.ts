import * as fs from 'fs';
import * as path from 'path';

export const AUTH_DIR = '.auth';
export const STAGING_STATE_PATH = path.join(AUTH_DIR, 'state.json');
export const TEST_USER_STATE_PATH = path.join(AUTH_DIR, 'test-user.json');
export const APP_USER_STATE_PATH = path.join(AUTH_DIR, 'app-user-state.json');

export type RuntimeTestUser = {
  email: string;
  username: string;
  password: string;
  mfaSecret: string;
  createdAt: string;
  verifiedAt: string;
  mfaEnabledAt: string;
};

export type RuntimeTestUserState =
  | {
      status: 'ready';
      baseURL: string;
      user: RuntimeTestUser;
    }
  | {
      status: 'failed' | 'skipped';
      baseURL: string;
      error: string;
      createdAt: string;
    };

export type RuntimeTestUserInput = Omit<
  RuntimeTestUser,
  'createdAt' | 'verifiedAt' | 'mfaEnabledAt' | 'mfaSecret'
>;

export function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export function generateRuntimeTestUser(): RuntimeTestUserInput {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const mailDomain = process.env.TEST_MAIL_DOMAIN ?? 'example.org';

  return {
    email: `playwright-${suffix}@${mailDomain}`,
    username: `pw${suffix}`.replace(/[^a-zA-Z0-9]/g, ''),
    password: `Test1234!${suffix}`,
  };
}

export function writeRuntimeTestUserState(state: RuntimeTestUserState) {
  ensureAuthDir();
  fs.writeFileSync(TEST_USER_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export function readRuntimeTestUserState(): RuntimeTestUserState {
  if (!fs.existsSync(TEST_USER_STATE_PATH)) {
    throw new Error(
      `App-Testuser-State fehlt (${TEST_USER_STATE_PATH}). Der globale Test-Setup-Flow ist nicht gelaufen.`,
    );
  }

  return JSON.parse(fs.readFileSync(TEST_USER_STATE_PATH, 'utf-8')) as RuntimeTestUserState;
}

export function requireRuntimeTestUser(): RuntimeTestUser {
  const state = readRuntimeTestUserState();

  if (state.status !== 'ready') {
    throw new Error(
      `App-Testuser ist nicht verfügbar (${state.status}): ${state.error}. ` +
        'Abhängige Tests werden vor dem App-Login abgebrochen.',
    );
  }

  return state.user;
}
