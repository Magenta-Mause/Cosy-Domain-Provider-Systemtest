import { test, expect } from '../fixtures';
import { BillingPage, StripeCheckoutPage, StripePortalPage } from '@pages/index';

test.describe('Stripe-Abonnement-Flow', () => {
  test.skip(
    process.env.RUN_STRIPE_TESTS !== '1',
    'Stripe-Tests laufen nur mit RUN_STRIPE_TESTS=1.',
  );

  test('Nutzer kann Cosy+ abonnieren und im Customer Portal wieder kündigen', async ({
    authenticatedPage,
    appTestUser,
  }) => {
    test.setTimeout(420_000);

    const billing = new BillingPage(authenticatedPage);
    const checkout = new StripeCheckoutPage(authenticatedPage);
    const portal = new StripePortalPage(authenticatedPage);

    await billing.navigate();
    await expect(billing.currentPlanLabel).toBeVisible();
    await expect(billing.freeBadge).toBeVisible();

    await billing.openCheckout();
    await checkout.completeSubscription({
      email: appTestUser.email,
      name: appTestUser.username,
    });

    await authenticatedPage.waitForURL(/\/billing\?success=true/, { timeout: 90_000 });
    await expect
      .poll(
        async () => {
          await authenticatedPage.goto('/billing');
          await expect(billing.currentPlanLabel).toBeVisible({ timeout: 15_000 });
          return await billing.plusPlanDescription.isVisible().catch(() => false);
        },
        { timeout: 240_000, intervals: [3_000, 8_000] },
      )
      .toBe(true);

    await billing.navigate();
    await billing.openPortal();
    await portal.cancelSubscription();

    if (await portal.returnToAppLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await portal.returnToAppLink.click();
    } else {
      await authenticatedPage.goto('/billing');
    }
    await authenticatedPage.waitForURL(/\/billing/, { timeout: 30_000 });
  });
});
