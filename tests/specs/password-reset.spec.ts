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
  }

  async function verifyAccount(page: import('@playwright/test').Page, email: string, after: Date) {
    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after,
      timeoutMs: 30_000,
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

    test('Reset-Link aus der Mail setzt ein neues Passwort und authentifiziert den Nutzer', async ({
      page,
    }) => {
      test.setTimeout(60_000);

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
        timeoutMs: 30_000,
      });

      const resetPassword = new ResetPasswordPage(page);
      const twoFactorSetup = new TwoFactorSetupPage(page);
      await resetPassword.navigateWithToken(mail.extractResetPasswordToken(resetMail));
      await resetPassword.resetPassword(newPassword);
      updateCleanupUser(email, { password: newPassword });
      await expect(twoFactorSetup.heading).toBeVisible();
    });

    test('Ungültige Reset-Tokens zeigen eine verständliche Fehlermeldung', async ({ page }) => {
      const resetPassword = new ResetPasswordPage(page);

      await resetPassword.navigateWithToken('00000000-0000-0000-0000-000000000000');
      await resetPassword.resetPassword('NewTest1234!');

      await expect(resetPassword.invalidOrExpiredMessage).toBeVisible();
    });
  });
});
