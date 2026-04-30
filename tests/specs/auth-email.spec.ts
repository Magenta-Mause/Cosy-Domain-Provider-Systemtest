import { test, expect } from '../fixtures';
import { VerifyPage } from '@pages/index';
import {
  MailService,
  generateTestEmail,
  enableCaptchaBypass,
  recordCleanupUser,
} from '@helpers/index';

test.describe('E-Mail-Verifizierungs-Flow', () => {
  test.skip(
    process.env.RUN_MAIL_FLOW_TESTS !== '1',
    'Mail-Flow-Tests laufen nur mit RUN_MAIL_FLOW_TESTS=1, damit der Default-Staging-Run nur den Setup-User per Mail registriert.',
  );

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
    const res = await page.request.post(`${baseUrl}/api/v1/auth/register?tokenMode=COOKIE`, {
      data: { ...opts, captchaToken: 'BYPASS' },
    });
    expect(res.status()).toBe(201);
    recordCleanupUser({
      email: opts.email,
      password: opts.password,
      source: 'auth-email.spec.ts',
    });
  }

  test('Registrierung löst Verifizierungsmail aus, Token-Link verifiziert den Account', async ({
    page,
  }) => {
    const email = generateTestEmail();
    const startedAt = new Date();

    await registerViaApi(page, {
      email,
      username: `pw${Date.now().toString(36)}`,
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
      username: `pw${Date.now().toString(36)}`,
      password: 'Test1234!',
    });

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after: startedAt,
      timeoutMs: 30_000,
    });

    expect(mail.extractVerifyToken(verifyMail)).toMatch(/^[A-Z0-9]{6}$/);

    const verify = new VerifyPage(page);
    await page.goto('/verify');
    const resendStartedAt = new Date();
    await verify.requestVerificationEmail();
    const resendMail = await mail.waitForMail({
      recipient: email,
      subjectContains: 'Verify Your Account',
      after: resendStartedAt,
      timeoutMs: 30_000,
    });
    const token = mail.extractVerifyToken(resendMail);
    await verify.verifyWithCode(token);
    await expect(verify.successMessage).toBeVisible();
  });
});
