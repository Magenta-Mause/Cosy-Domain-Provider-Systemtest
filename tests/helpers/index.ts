import type { BrowserContext, Page } from '@playwright/test';

export { MailService } from './mail-service';

export function generateSubdomain(): string {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTestEmail(domain = 'test.example.de'): string {
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
