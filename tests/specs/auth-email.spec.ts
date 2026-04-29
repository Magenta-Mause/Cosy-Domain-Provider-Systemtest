import { test, expect } from '../fixtures';
import { RegisterPage } from '@pages/register-page';
import { VerifyPage } from '@pages/verify-page';
import { MailService, generateTestEmail } from '@helpers/index';

test.describe('E-Mail-Verifizierungs-Flow', () => {
  test.skip(
    !process.env.MAIL_SERVICE_API_KEY,
    'MAIL_SERVICE_API_KEY nicht gesetzt — Mail-Tests übersprungen',
  );

  test('Registrierung löst Verifizierungsmail aus, Token-Link verifiziert den Account', async ({
    page,
  }) => {
    const email = generateTestEmail();
    const password = 'Test1234!';
    const startedAt = new Date();

    const register = new RegisterPage(page);
    await register.navigate();
    await register.register({
      username: `playwright-${Date.now()}`,
      email,
      password,
    });

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after: startedAt,
      timeoutMs: 30_000,
    });

    const token = mail.extractVerifyToken(verifyMail);

    const verify = new VerifyPage(page);
    await verify.navigateWithToken(token);

    await expect(verify.successMessage).toBeVisible();
  });

  test('Verifizierungsmail enthält manuellen Code, der im Formular funktioniert', async ({
    page,
  }) => {
    const email = generateTestEmail();
    const password = 'Test1234!';
    const startedAt = new Date();

    const register = new RegisterPage(page);
    await register.navigate();
    await register.register({
      username: `playwright-${Date.now()}`,
      email,
      password,
    });

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after: startedAt,
      timeoutMs: 30_000,
    });

    const token = mail.extractVerifyToken(verifyMail);

    const verify = new VerifyPage(page);
    await page.goto('/verify');
    await verify.verifyWithCode(token);

    await expect(verify.successMessage).toBeVisible();
  });
});
