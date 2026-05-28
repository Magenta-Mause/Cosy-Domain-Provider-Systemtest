import type { Page } from '@playwright/test';

export class BillingPage {
  constructor(private readonly page: Page) {}

  get currentPlanLabel() {
    return this.page.getByText(/current plan|aktueller plan/i);
  }

  get freeBadge() {
    return this.page.getByText(/^free|kostenlos$/i).first();
  }

  get plusBadge() {
    return this.page.getByText(/^cosy\+$/i).first();
  }

  get manageSubscriptionButton() {
    return this.page.getByRole('button', { name: /manage subscription|abo verwalten/i });
  }

  get plusPlanDescription() {
    return this.page.getByText(/thank you for supporting|danke für deine unterstützung/i);
  }

  get portalButton() {
    return this.page.getByTestId('billing-portal-btn');
  }

  get backLink() {
    return this.page.getByTestId('billing-back-link');
  }

  async navigate() {
    await this.page.goto('/billing');
  }

  async openCheckout() {
    await this.portalButton
      .filter({ hasText: /upgrade to cosy\+|auf cosy\+ upgraden/i })
      .waitFor({ state: 'visible', timeout: 30_000 });
    await this.portalButton.click();
    await this.page.waitForURL(/checkout\.stripe\.com/);
  }

  async openPortal() {
    // Derselbe Button öffnet je nach userTier Checkout (Free) oder Portal (Plus).
    // Nach goto('/billing') hydratisiert useAuthInformation() asynchron; wenn wir
    // klicken bevor der Tier-Refetch durch ist, landet der Klick im Checkout-Branch
    // und waitForURL läuft ins Timeout. Auf den "Manage"-Label warten = Tier=PLUS bestätigt.
    await this.portalButton
      .filter({ hasText: /manage subscription|abonnement verwalten/i })
      .waitFor({ state: 'visible', timeout: 30_000 });
    await this.portalButton.click();
    await this.page.waitForURL(/billing\.stripe\.com/, { timeout: 30_000 });
  }
}
