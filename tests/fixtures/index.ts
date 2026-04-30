import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP_USER_STATE_PATH, requireRuntimeTestUser } from '@helpers/runtime-test-user';
import type { RuntimeTestUser } from '@helpers/runtime-test-user';

type Fixtures = {
  appTestUser: RuntimeTestUser;
  authenticatedPage: Page;
};

export const test = base.extend<Fixtures>({
  appTestUser: async ({}, use) => {
    await use(requireRuntimeTestUser());
  },

  authenticatedPage: async ({ browser, appTestUser }, use) => {
    const context = await browser.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
      locale: 'de-DE',
      storageState: APP_USER_STATE_PATH,
    });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await use(page);
    } finally {
      await context.close();
    }
  },
});

export { expect } from '@playwright/test';
