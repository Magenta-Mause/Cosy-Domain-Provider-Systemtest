import type { Page } from '@playwright/test';

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
