import { test, expect, runsOnlyAgainstStaging, runsOnlyWithEnv } from '../fixtures';
import { LoginPage, TwoFactorSetupPage } from '@pages/index';
import {
  MAIL_FLOW_TEST_TIMEOUT_MS,
  STAGING_STATE_PATH,
  enableCaptchaBypass,
  generateTotpCode,
  registerTestUserViaApi,
  resolveBaseURL,
  updateCleanupUser,
  verifyUserViaMailLink,
} from '@helpers/index';

test.describe('MFA-UI-Flow', () => {
  runsOnlyAgainstStaging(
    'MFA-UI-Test braucht die Staging-Mail-Pipeline für die Verifizierungsmail — lokal nicht verdrahtet.',
  );
  runsOnlyWithEnv('MAIL_SERVICE_API_KEY', 'MFA-UI-Test');

  test('MFA wird im Browser eingerichtet und beim Login abgefragt', async ({ page, browser }) => {
    test.setTimeout(MAIL_FLOW_TEST_TIMEOUT_MS);

    const user = await test.step('Given: ein frisch registrierter, verifizierter User', async () => {
      const u = await registerTestUserViaApi(page, { source: 'mfa-ui.spec.ts' });
      await verifyUserViaMailLink(page, u, { timeoutMs: 120_000 });
      return u;
    });

    const secret = await test.step('When: er MFA über die Setup-Seite einrichtet', async () => {
      const setup = new TwoFactorSetupPage(page);
      await setup.navigate();
      await expect(setup.heading).toBeVisible();
      await expect(setup.qrCode).toBeVisible();

      const s = (await setup.secret.innerText()).replace(/\s+/g, '');
      expect(s).toMatch(/^[A-Z2-7]+$/);
      updateCleanupUser(user.email, { mfaSecret: s });

      await setup.confirm(generateTotpCode(s));
      await expect(page).toHaveURL(/\/dashboard/);
      return s;
    });

    await test.step('Then: fragt ein frischer Login den TOTP-Code ab', async () => {
      // Neuer Browser-Context = keine Session-Cookies, nur die Staging-Barrier.
      const loginContext = await browser.newContext({
        baseURL: resolveBaseURL(),
        locale: 'de-DE',
        storageState: STAGING_STATE_PATH,
      });
      await enableCaptchaBypass(loginContext);
      const loginPage = await loginContext.newPage();

      try {
        const login = new LoginPage(loginPage);
        await login.navigate();
        await login.submitCredentialsForMfa(user.email, user.password);
        await expect(login.mfaTotpInput).toBeVisible();
        await login.completeMfa(generateTotpCode(secret));
        await expect(loginPage).toHaveURL(/\/dashboard/);
      } finally {
        await loginContext.close();
      }
    });
  });
});
