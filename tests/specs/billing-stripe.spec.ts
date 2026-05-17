import { test, expect } from '../fixtures';
import { BillingPage, StripeCheckoutPage, StripePortalPage } from '@pages/index';

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
    await expect
      .poll(
        async () => {
          await authenticatedPage.reload();
          return await billing.plusBadge.isVisible();
        },
        { timeout: 60_000, intervals: [2_000, 5_000] },
      )
      .toBe(true);
  });

  test.fixme(
    'Nutzer kann das Cosy+ Abo im Customer Portal kündigen',
    async ({ authenticatedPage, appTestUser }) => {
      // FIXME: Stripe-Checkout-Page hat sich UI-seitig geändert (DE-Labels
      // "Gültig bis"/"Prüfziffer", neue Layout-Struktur). Der vorgelagerte
      // Checkout-Schritt schlägt aktuell mit "cardNumberInput nicht sichtbar"
      // fehl, sodass dieser Cancel-Spec ungetestet bleibt. Plan:
      // 1. Mit `npm run test:staging:stripe -- --headed --debug` durchklicken
      // 2. Stripe-Checkout-Selectors fixen
      // 3. Selectors für Customer Portal Cancel ggf. anpassen (siehe
      //    StripePortalPage — basiert auf Stripe-Doku-Standard, evtl. UI-shift)
      test.setTimeout(240_000);

      const billing = new BillingPage(authenticatedPage);
      const checkout = new StripeCheckoutPage(authenticatedPage);
      const portal = new StripePortalPage(authenticatedPage);

      await billing.navigate();
      await billing.openCheckout();
      await checkout.completeSubscription({
        email: appTestUser.email,
        name: appTestUser.username,
      });
      await authenticatedPage.waitForURL(/\/billing\?success=true/, { timeout: 90_000 });
      await expect
        .poll(
          async () => {
            await authenticatedPage.reload();
            return await billing.plusBadge.isVisible();
          },
          { timeout: 60_000, intervals: [2_000, 5_000] },
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
    },
  );
});
