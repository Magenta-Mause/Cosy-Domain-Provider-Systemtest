import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { isStagingTarget, resolveBaseURL } from '@helpers/constants';
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
      baseURL: resolveBaseURL(),
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

// ---------------------------------------------------------------------------
// Skip-Guards für Opt-in-Specs — direkt im test.describe-Body aufrufen.
// Die Skip-Gründe erscheinen so einheitlich im Report/Monitor.
// ---------------------------------------------------------------------------

/** Spec braucht eine Env-Var (z.B. API-Key) — sonst übersprungen. */
export function runsOnlyWithEnv(envVar: string, what: string) {
  test.skip(!process.env[envVar], `${envVar} nicht gesetzt — ${what} übersprungen`);
}

/** Spec läuft nur gegen das deployte Staging (z.B. weil echtes Route53 nötig ist). */
export function runsOnlyAgainstStaging(reason: string) {
  test.skip(!isStagingTarget(), reason);
}
