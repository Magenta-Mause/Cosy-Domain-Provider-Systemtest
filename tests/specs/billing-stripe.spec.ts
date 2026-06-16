import { test, expect } from '../fixtures';
import { BillingPage, StripeCheckoutPage, StripePortalPage } from '@pages/index';

test.describe('Stripe-Abonnement-Flow', () => {
  test.skip(
    process.env.RUN_STRIPE_TESTS !== '1',
    'Stripe-Tests laufen nur mit RUN_STRIPE_TESTS=1.',
  );

  // beforeEach kann beim Auto-Heal (Subscription kündigen) länger brauchen als die
  // Playwright-Default 30s — Stripe-Portal lädt teilweise zäh. Test-setTimeout im
  // Body kommt zu spät (Hooks laufen davor), deshalb hier auf describe-Ebene.
  test.describe.configure({ timeout: 420_000 });

  test.beforeEach(async ({ authenticatedPage }) => {
    // Auto-heal: wenn der Fixture-User aus einem abgebrochenen Vorlauf noch auf
    // Cosy+ steht, hier zurück auf Free zwingen damit der eigentliche Test sauber
    // startet. Bei ephemeren Usern (USE_FIXTURE_USER nicht gesetzt) ist das ein
    // No-op weil der frisch registrierte User immer auf Free steht.
    const billing = new BillingPage(authenticatedPage);
    const portal = new StripePortalPage(authenticatedPage);

    await billing.navigate();
    await expect(billing.currentPlanLabel).toBeVisible({ timeout: 15_000 });

    if (await billing.isPlus()) {
      await billing.openPortal();
      await portal.cancelSubscription();
      await portal.dismissFeedbackSurvey();
      await authenticatedPage.goto('/billing');
      await expect(billing.upgradeButton).toBeVisible({ timeout: 30_000 });
    }
  });

  test('Nutzer kann Cosy+ abonnieren und im Customer Portal wieder kündigen', async ({
    authenticatedPage,
    appTestUser,
  }) => {
    const billing = new BillingPage(authenticatedPage);
    const checkout = new StripeCheckoutPage(authenticatedPage);
    const portal = new StripePortalPage(authenticatedPage);

    let subscribed = false;
    let cancelled = false;

    try {
      await billing.navigate();
      await expect(billing.currentPlanLabel).toBeVisible();
      await expect(billing.freeBadge).toBeVisible();

      await billing.openCheckout();
      await checkout.completeSubscription({
        email: appTestUser.email,
        name: appTestUser.username,
      });
      subscribed = true;

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
      cancelled = true;
      await expect(portal.cancellationNotice).toBeVisible({ timeout: 15_000 });
      await portal.dismissFeedbackSurvey();

      if (await portal.returnToAppLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await portal.returnToAppLink.click();
      } else {
        await authenticatedPage.goto('/billing');
      }
      await authenticatedPage.waitForURL(/\/billing/, { timeout: 30_000 });
    } finally {
      if (subscribed && !cancelled) {
        try {
          await billing.navigate();
          await billing.openPortal();
          await portal.cancelSubscription();
          await portal.dismissFeedbackSurvey();
        } catch (cleanupError) {
          console.warn(`Stripe-Cleanup im finally fehlgeschlagen: ${cleanupError}`);
        }
      }
    }
  });
});
