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
    await this.portalButton.click();
    await this.page.waitForURL(/checkout\.stripe\.com/);
  }
}
