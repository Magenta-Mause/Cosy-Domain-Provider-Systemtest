import { test as base } from '@playwright/test';

// Hier kommen später Fixtures rein: eingeloggter User, Test-Domains, etc.
// Beispiel:
//
// type Fixtures = {
//   authenticatedPage: Page;
// };
//
// export const test = base.extend<Fixtures>({
//   authenticatedPage: async ({ page }, use) => {
//     await page.goto('/login');
//     // ... login steps
//     await use(page);
//   },
// });

export const test = base;
export { expect } from '@playwright/test';
