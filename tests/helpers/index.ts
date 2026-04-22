import type { Page } from '@playwright/test';

export function generateSubdomain(): string {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

export async function waitForApiIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
