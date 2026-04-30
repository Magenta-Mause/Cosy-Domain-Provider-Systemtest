import { test, expect } from '../fixtures';
import { VerifyPage } from '@pages/verify-page';
import { MailService, generateTestEmail, enableCaptchaBypass } from '@helpers/index';

test.describe('E-Mail-Verifizierungs-Flow', () => {
  test.skip(
    !process.env.MAIL_SERVICE_API_KEY,
    'MAIL_SERVICE_API_KEY nicht gesetzt — Mail-Tests übersprungen',
  );

  async function registerViaApi(
    page: import('@playwright/test').Page,
    opts: { email: string; username: string; password: string },
  ) {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
    await enableCaptchaBypass(page.context());
    const res = await page.request.post(`${baseUrl}/api/v1/auth/register?tokenMode=DIRECT`, {
      data: { ...opts, captchaToken: 'BYPASS' },
    });
    expect(res.status()).toBe(201);
  }

  test('Registrierung löst Verifizierungsmail aus, Token-Link verifiziert den Account', async ({
    page,
  }) => {
    const email = generateTestEmail();
    const startedAt = new Date();

    await registerViaApi(page, {
      email,
      username: `playwright-${Date.now()}`,
      password: 'Test1234!',
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
    const startedAt = new Date();

    await registerViaApi(page, {
      email,
      username: `playwright-${Date.now()}`,
      password: 'Test1234!',
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
