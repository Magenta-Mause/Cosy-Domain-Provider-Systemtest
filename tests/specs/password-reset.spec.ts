import { test, expect, runsOnlyAgainstStaging, runsOnlyWithEnv } from '../fixtures';
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  TwoFactorSetupPage,
} from '@pages/index';
import {
  MAIL_FLOW_TEST_TIMEOUT_MS,
  MailService,
  RESET_PASSWORD_MAIL_SUBJECT,
  loginWithoutMfaViaApi,
  logoutKeepingStagingBarrier,
  registerTestUserViaApi,
  setupMfaViaApi,
  updateCleanupUser,
  verifyUserViaMailLink,
} from '@helpers/index';

test.describe('Passwort-Reset-Flow', () => {
  test('Login-E-Mail wird im Passwort-vergessen-Formular vorbefüllt', async ({ page }) => {
    const email = 'prefill-check@example.de';
    const login = new LoginPage(page);
    const forgotPassword = new ForgotPasswordPage(page);

    await test.step('Given: ein User hat im Login seine E-Mail eingegeben', async () => {
      await login.navigate();
      await login.emailInput.fill(email);
      await login.emailContinueBtn.click();
      await expect(login.passwordInput).toBeVisible();
    });

    await test.step('When: er "Passwort vergessen" öffnet', async () => {
      await login.forgotPasswordLink.click();
    });

    await test.step('Then: ist seine E-Mail dort vorbefüllt', async () => {
      await expect(forgotPassword.emailInput).toBeVisible();
      await expect(forgotPassword.emailInput).toHaveValue(email);
    });
  });

  test.describe('mit Testmailbox', () => {
    runsOnlyAgainstStaging(
      'Mail-Flow-Tests brauchen die Staging-Mail-Pipeline (Backend → Test-Mailbox) — lokal nicht verdrahtet.',
    );
    runsOnlyWithEnv('MAIL_SERVICE_API_KEY', 'Mail-Tests');

    test('Reset-Link setzt neues Passwort und MFA wird mit zurückgesetzt', async ({ page }) => {
      test.setTimeout(MAIL_FLOW_TEST_TIMEOUT_MS);

      const newPassword = `NewTest1234!${Date.now().toString(36)}`;

      const user = await test.step('Given: ein verifizierter User mit MFA', async () => {
        const u = await registerTestUserViaApi(page, { source: 'password-reset.spec.ts' });
        await verifyUserViaMailLink(page, u);
        // MFA per API einrichten — das UI-Setup wird in mfa-ui.spec.ts geprüft.
        const mfaSecret = await setupMfaViaApi(page.request, u.email);
        return { ...u, mfaSecret };
      });

      await test.step('And: der User ist ausgeloggt', async () => {
        await logoutKeepingStagingBarrier(page);
      });

      const resetToken = await test.step('When: er über "Passwort vergessen" einen Reset-Link anfordert', async () => {
        const forgotPassword = new ForgotPasswordPage(page);
        await forgotPassword.navigate();
        const requestedAt = new Date();
        await forgotPassword.requestReset(user.email);
        await expect(forgotPassword.successMessage).toBeVisible();

        const mail = new MailService();
        const resetMail = await mail.waitForMail({
          recipient: user.email,
          subjectContains: RESET_PASSWORD_MAIL_SUBJECT,
          after: requestedAt,
        });
        return mail.extractResetPasswordToken(resetMail);
      });

      await test.step('And: über den Link ein neues Passwort setzt', async () => {
        const resetPassword = new ResetPasswordPage(page);
        await resetPassword.navigateWithToken(resetToken);
        await resetPassword.resetPassword(newPassword);
        updateCleanupUser(user.email, { password: newPassword });
        await page.waitForURL(/\/login/, { timeout: 10_000 });
      });

      await test.step('Then: funktioniert der Login mit dem neuen Passwort ohne MFA', async () => {
        // Programmatisch statt UI (Turnstile blockiert headless) — und der leere
        // Response-Body beweist, dass das Backend keine MFA-Challenge mehr stellt.
        await loginWithoutMfaViaApi(page.request, { email: user.email, password: newPassword });
      });

      const newSecret = await test.step('And: das Dashboard erzwingt ein neues MFA-Setup', async () => {
        // require-full-auth leitet zu /mfa-setup, weil mfaEnabled durch den Reset
        // false ist — das ist der eigentliche MFA-Reset-Beweis.
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/mfa-setup/, { timeout: 10_000 });
        await expect(new TwoFactorSetupPage(page).heading).toBeVisible();
        // Neues Secret per API bestätigen (umgeht den input-otp/StrictMode-Race im Dev-Build).
        return setupMfaViaApi(page.request, user.email);
      });

      await test.step('And: mit dem neuen MFA ist das Dashboard wieder erreichbar', async () => {
        expect(newSecret).not.toBe(user.mfaSecret);
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/dashboard/);
      });
    });

    test('Ungültige Reset-Tokens zeigen eine verständliche Fehlermeldung', async ({ page }) => {
      const resetPassword = new ResetPasswordPage(page);

      await test.step('When: ein Passwort mit einem ungültigen Token gesetzt werden soll', async () => {
        await resetPassword.navigateWithToken('00000000-0000-0000-0000-000000000000');
        await resetPassword.resetPassword('NewTest1234!');
      });

      await test.step('Then: erscheint die Fehlermeldung', async () => {
        await expect(resetPassword.invalidOrExpiredMessage).toBeVisible();
      });
    });
  });
});
