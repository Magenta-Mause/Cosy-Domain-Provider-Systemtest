import { test, expect } from '../fixtures';
import { LoginPage, TwoFactorSetupPage, VerifyPage } from '@pages/index';
import {
  enableCaptchaBypass,
  generateTestEmail,
  generateTotpCode,
  MailService,
  recordCleanupUser,
  updateCleanupUser,
} from '@helpers/index';

test.describe('MFA-UI-Flow', () => {
  test.skip(
    process.env.RUN_MFA_UI_TESTS !== '1',
    'MFA-UI-Test läuft nur mit RUN_MFA_UI_TESTS=1, weil er eine zusätzliche Verifizierungsmail erzeugt.',
  );

  test.skip(
    !process.env.MAIL_SERVICE_API_KEY,
    'MAIL_SERVICE_API_KEY nicht gesetzt — MFA-UI-Test übersprungen',
  );

  async function registerViaApi(
    page: import('@playwright/test').Page,
    opts: { email: string; username: string; password: string },
  ) {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
    await enableCaptchaBypass(page.context());
    const res = await page.request.post(`${baseUrl}/api/v1/auth/register?tokenMode=COOKIE`, {
      data: { ...opts, captchaToken: 'BYPASS' },
    });
    expect(res.status()).toBe(201);
    recordCleanupUser({
      email: opts.email,
      password: opts.password,
      source: 'mfa-ui.spec.ts',
    });
  }

  test('MFA wird im Browser eingerichtet und beim Login abgefragt', async ({ page, browser }) => {
    test.setTimeout(240_000);

    const email = generateTestEmail();
    const password = 'Test1234!';
    const registeredAt = new Date();

    await registerViaApi(page, {
      email,
      username: `mfa${Date.now().toString(36)}`,
      password,
    });

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after: registeredAt,
      timeoutMs: 120_000,
    });

    const verify = new VerifyPage(page);
    await verify.navigateWithToken(mail.extractVerifyToken(verifyMail));
    await expect(verify.successMessage).toBeVisible();

    const setup = new TwoFactorSetupPage(page);
    await setup.navigate();
    await expect(setup.heading).toBeVisible();
    await expect(setup.qrCode).toBeVisible();
    const secret = (await setup.secret.innerText()).replace(/\s+/g, '');
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    updateCleanupUser(email, { mfaSecret: secret });

    await setup.confirm(generateTotpCode(secret));
    await expect(page).toHaveURL(/\/dashboard/);

    const loginContext = await browser.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
      locale: 'de-DE',
      storageState: '.auth/state.json',
    });
    await enableCaptchaBypass(loginContext);
    const loginPageHandle = await loginContext.newPage();

    try {
      const login = new LoginPage(loginPageHandle);
      await login.navigate();
      await login.submitCredentialsForMfa(email, password);
      await expect(login.mfaTotpInput).toBeVisible();
      await login.completeMfa(generateTotpCode(secret));
      await expect(loginPageHandle).toHaveURL(/\/dashboard/);
    } finally {
      await loginContext.close();
    }
  });
});
