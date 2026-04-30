import { test, expect } from '../fixtures';
import { BillingPage, StripeCheckoutPage } from '@pages/index';

test.describe('Stripe-Abonnement-Flow', () => {
  test.skip(
    process.env.RUN_STRIPE_TESTS !== '1',
    'Stripe-Tests laufen nur mit RUN_STRIPE_TESTS=1.',
  );

  test('Nutzer kann über Stripe Checkout zu Cosy+ wechseln', async ({
    authenticatedPage,
    appTestUser,
  }) => {
    test.setTimeout(180_000);

    const billing = new BillingPage(authenticatedPage);
    const checkout = new StripeCheckoutPage(authenticatedPage);

    await billing.navigate();
    await expect(billing.currentPlanLabel).toBeVisible();
    await expect(billing.freeBadge).toBeVisible();

    await billing.openCheckout();
    await checkout.completeSubscription({
      email: appTestUser.email,
      name: appTestUser.username,
    });

    await authenticatedPage.waitForURL(/\/billing\?success=true/, { timeout: 90_000 });
    await expect.poll(async () => {
      await authenticatedPage.reload();
      return await billing.plusBadge.isVisible();
    }, {
      timeout: 60_000,
      intervals: [2_000, 5_000],
    }).toBe(true);
  });
});
