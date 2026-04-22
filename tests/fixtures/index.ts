import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LoginPage } from '@pages/login-page';

type Fixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login(
      process.env.TEST_USERNAME ?? 'testuser',
      process.env.TEST_PASSWORD ?? 'testpass',
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
