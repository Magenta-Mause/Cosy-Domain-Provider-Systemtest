import type { BrowserContext, Page } from '@playwright/test';

export { MailService } from './mail-service';
export { generateTotpCode } from './totp';
export {
  requireRuntimeTestUser,
  readRuntimeTestUserState,
  APP_USER_STATE_PATH,
  TEST_USER_STATE_PATH,
} from './runtime-test-user';
export type { RuntimeTestUser, RuntimeTestUserState } from './runtime-test-user';

export function generateSubdomain(): string {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTestEmail(domain = 'example.org'): string {
  return `playwright-${Date.now()}@${domain}`;
}

export async function waitForApiIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

export async function enableCaptchaBypass(context: BrowserContext): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
  await context.addCookies([
    {
      name: 'CAPTCHA_BYPASS',
      value: '1',
      domain: new URL(baseUrl).hostname,
      path: '/',
    },
  ]);
}
