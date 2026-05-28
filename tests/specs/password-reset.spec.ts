import { test, expect } from '../fixtures';
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  TwoFactorSetupPage,
  VerifyPage,
} from '@pages/index';
import {
  MailService,
  enableCaptchaBypass,
  generateTestEmail,
  generateTotpCode,
  recordCleanupUser,
  updateCleanupUser,
} from '@helpers/index';

test.describe('Passwort-Reset-Flow', () => {
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
      source: 'password-reset.spec.ts',
    });

    const tokenRes = await page.request.get(`${baseUrl}/api/v1/auth/token`);
    expect(tokenRes.ok()).toBeTruthy();
    const identityToken = await tokenRes.text();
    const resendRes = await page.request.post(
      `${baseUrl}/api/v1/auth/resend-verification`,
      { headers: { Authorization: `Bearer ${identityToken}` } },
    );
    expect(resendRes.ok()).toBeTruthy();
  }

  async function verifyAccount(page: import('@playwright/test').Page, email: string, after: Date) {
    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after,
      timeoutMs: 90_000,
    });

    const verify = new VerifyPage(page);
    await verify.navigateWithToken(mail.extractVerifyToken(verifyMail));
    await expect(verify.successMessage).toBeVisible();
  }

  test('Login-E-Mail wird im Passwort-vergessen-Formular vorbefüllt', async ({ page }) => {
    const email = 'prefill-check@example.de';
    const login = new LoginPage(page);
    const forgotPassword = new ForgotPasswordPage(page);

    await login.navigate();
    await login.emailInput.fill(email);
    await login.emailContinueBtn.click();
    await expect(login.passwordInput).toBeVisible();

    await login.forgotPasswordLink.click();
    await expect(forgotPassword.emailInput).toBeVisible();
    await expect(forgotPassword.emailInput).toHaveValue(email);
  });

  test.describe('mit Testmailbox', () => {
    test.skip(
      process.env.RUN_MAIL_FLOW_TESTS !== '1',
      'Mail-Flow-Tests laufen nur mit RUN_MAIL_FLOW_TESTS=1, damit der Default-Staging-Run nur den Setup-User per Mail registriert.',
    );

    test.skip(
      !process.env.MAIL_SERVICE_API_KEY,
      'MAIL_SERVICE_API_KEY nicht gesetzt — Mail-Tests übersprungen',
    );

    test('Reset-Link setzt neues Passwort und MFA wird mit zurückgesetzt', async ({
      page,
    }) => {
      test.setTimeout(240_000);

      const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
      const email = generateTestEmail();
      const oldPassword = 'OldTest1234!';
      const newPassword = `NewTest1234!${Date.now().toString(36)}`;
      const registeredAt = new Date();

      await registerViaApi(page, {
        email,
        username: `reset${Date.now().toString(36)}`,
        password: oldPassword,
      });
      await verifyAccount(page, email, registeredAt);

      // Initiales MFA per API einrichten (UI-Setup wird in mfa-ui.spec.ts geprüft).
      const initialToken = await page.request
        .get(`${baseUrl}/api/v1/auth/token`)
        .then((r) => r.text());
      const initialSetup = (await page.request
        .post(`${baseUrl}/api/v1/auth/mfa/setup`, {
          headers: { Authorization: `Bearer ${initialToken}` },
        })
        .then((r) => r.json())) as { secret: string };
      const initialSecret = initialSetup.secret;
      updateCleanupUser(email, { mfaSecret: initialSecret });
      const initialConfirmRes = await page.request.post(
        `${baseUrl}/api/v1/auth/mfa/confirm`,
        {
          headers: { Authorization: `Bearer ${initialToken}` },
          data: { totpCode: generateTotpCode(initialSecret) },
        },
      );
      expect(initialConfirmRes.ok()).toBeTruthy();

      await page.context().clearCookies();
      await enableCaptchaBypass(page.context());

      const forgotPassword = new ForgotPasswordPage(page);
      await forgotPassword.navigate();
      const resetRequestedAt = new Date();
      await forgotPassword.requestReset(email);
      await expect(forgotPassword.successMessage).toBeVisible();

      const mail = new MailService();
      const resetMail = await mail.waitForMail({
        recipient: email,
        subjectContains: 'Reset',
        after: resetRequestedAt,
        timeoutMs: 90_000,
      });

      const resetPassword = new ResetPasswordPage(page);
      await resetPassword.navigateWithToken(mail.extractResetPasswordToken(resetMail));
      await resetPassword.resetPassword(newPassword);
      updateCleanupUser(email, { password: newPassword });

      await page.waitForURL(/\/login/, { timeout: 10_000 });

      // Programmatisches Login (Turnstile-Widget blockiert UI-Login headless).
      const loginRes = await page.request.post(
        `${baseUrl}/api/v1/auth/login?tokenMode=COOKIE`,
        { data: { email, password: newPassword, captchaToken: 'BYPASS' } },
      );
      expect(loginRes.ok()).toBeTruthy();
      // mfaRequired=false → leerer Body. Falls Backend MFA noch hätte, käme JSON.
      expect(await loginRes.text()).toBe('');

      // Nach Login navigiert das Dashboard via require-full-auth zu /mfa-setup,
      // weil mfaEnabled jetzt false ist — das ist der eigentliche MFA-Reset-Beweis.
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/mfa-setup/, { timeout: 10_000 });
      const setup = new TwoFactorSetupPage(page);
      await expect(setup.heading).toBeVisible();

      // Neuen MFA-Secret aus dem Backend holen + bestätigen (API umgeht den
      // input-otp / React-StrictMode-Race im Dev-Build).
      const newToken = await page.request
        .get(`${baseUrl}/api/v1/auth/token`)
        .then((r) => r.text());
      const newSetup = (await page.request
        .post(`${baseUrl}/api/v1/auth/mfa/setup`, {
          headers: { Authorization: `Bearer ${newToken}` },
        })
        .then((r) => r.json())) as { secret: string };
      expect(newSetup.secret).not.toBe(initialSecret);
      updateCleanupUser(email, { mfaSecret: newSetup.secret });
      const newConfirmRes = await page.request.post(
        `${baseUrl}/api/v1/auth/mfa/confirm`,
        {
          headers: { Authorization: `Bearer ${newToken}` },
          data: { totpCode: generateTotpCode(newSetup.secret) },
        },
      );
      expect(newConfirmRes.ok()).toBeTruthy();

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('Ungültige Reset-Tokens zeigen eine verständliche Fehlermeldung', async ({ page }) => {
      const resetPassword = new ResetPasswordPage(page);

      await resetPassword.navigateWithToken('00000000-0000-0000-0000-000000000000');
      await resetPassword.resetPassword('NewTest1234!');

      await expect(resetPassword.invalidOrExpiredMessage).toBeVisible();
    });
  });
});
