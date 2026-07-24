import { test, expect, runsOnlyAgainstStaging, runsOnlyWithEnv } from '../fixtures';
import { VerifyPage } from '@pages/index';
import {
  MAIL_FLOW_TEST_TIMEOUT_MS,
  registerTestUserViaApi,
  waitForVerificationToken,
} from '@helpers/index';

test.describe('E-Mail-Verifizierungs-Flow', () => {
  runsOnlyAgainstStaging(
    'Mail-Flow-Tests brauchen die Staging-Mail-Pipeline (Backend → Test-Mailbox) — lokal nicht verdrahtet.',
  );
  runsOnlyWithEnv('MAIL_SERVICE_API_KEY', 'Mail-Tests');

  // Test 2 macht zwei Mail-Waits hintereinander — das Budget braucht Platz für beide.
  test.describe.configure({ timeout: MAIL_FLOW_TEST_TIMEOUT_MS });

  test('Registrierung löst Verifizierungsmail aus, Token-Link verifiziert den Account', async ({
    page,
  }) => {
    const user = await test.step('Given: ein frisch per API registrierter User', () =>
      registerTestUserViaApi(page, { source: 'auth-email.spec.ts' }));

    const token = await test.step('When: die Verifizierungsmail ankommt', () =>
      waitForVerificationToken(user.email, user.registeredAt));

    await test.step('Then: verifiziert der Token-Link den Account', async () => {
      const verify = new VerifyPage(page);
      await verify.navigateWithToken(token);
      await expect(verify.successMessage).toBeVisible();
    });
  });

  test('Verifizierungsmail enthält manuellen Code, der im Formular funktioniert', async ({
    page,
  }) => {
    const verify = new VerifyPage(page);

    const user = await test.step('Given: ein registrierter User mit 6-stelligem Code in der Verify-Mail', async () => {
      const u = await registerTestUserViaApi(page, { source: 'auth-email.spec.ts' });
      const token = await waitForVerificationToken(u.email, u.registeredAt);
      expect(token).toMatch(/^[A-Z0-9]{6}$/);
      return u;
    });

    const code = await test.step('When: er auf /verify eine neue Verifizierungsmail anfordert', async () => {
      await page.goto('/verify');
      const resendRequestedAt = new Date();
      await verify.requestVerificationEmail();
      return waitForVerificationToken(user.email, resendRequestedAt);
    });

    await test.step('Then: verifiziert der manuell eingegebene Code den Account', async () => {
      await verify.verifyWithCode(code);
      await expect(verify.successMessage).toBeVisible();
    });
  });
});
