import type { Page } from '@playwright/test';
import { STRIPE_TEST_CARD } from '@helpers/index';

export class StripeCheckoutPage {
  constructor(private readonly page: Page) {}

  get emailInput() {
    return this.page.getByLabel(/email/i);
  }

  get cardNumberInput() {
    return this.page.getByLabel(/card number|card information|kartennummer|karteninformationen/i);
  }

  get expiryInput() {
    return this.page.getByLabel(/expiration|expiry|ablauf/i);
  }

  get cvcInput() {
    return this.page.getByLabel(/cvc|cvv|security code|sicherheitscode/i);
  }

  get cardholderNameInput() {
    return this.page.getByLabel(/cardholder name|name on card|name des karteninhabers/i);
  }

  get postalCodeInput() {
    return this.page.getByLabel(/zip|postal|postleitzahl/i);
  }

  get submitButton() {
    return this.page.getByRole('button', { name: /subscribe|pay|zahlen|abonnieren/i }).last();
  }

  get aiAgentCheckbox() {
    return this.page.getByRole('checkbox', { name: /ai agent/i });
  }

  get cardPaymentOption() {
    return this.page.getByRole('radio', { name: /card|karte/i });
  }

  async completeSubscription(opts: { email: string; name?: string }) {
    await this.cardPaymentOption.check({ force: true }).catch(() => undefined);
    await this.page.getByText(/^karte|card$/i).click().catch(() => undefined);

    await this.emailInput.fill(opts.email).catch(() => undefined);
    await this.cardNumberInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.cardNumberInput.fill(STRIPE_TEST_CARD.number);
    await this.expiryInput.fill(STRIPE_TEST_CARD.expiry);
    await this.cvcInput.fill(STRIPE_TEST_CARD.cvc);
    await this.cardholderNameInput.fill(opts.name ?? 'Playwright Test').catch(() => undefined);
    await this.postalCodeInput.fill(STRIPE_TEST_CARD.postalCode).catch(() => undefined);
    await this.acknowledgeAiAgent();
    await this.submitButton.click();
  }

  private async acknowledgeAiAgent() {
    const checkbox = this.aiAgentCheckbox;
    const isVisible = await checkbox.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!isVisible) return;

    await checkbox.scrollIntoViewIfNeeded();
    if (!(await checkbox.isChecked())) {
      await checkbox.click({ force: true });
    }
    if (!(await checkbox.isChecked())) {
      await checkbox.check({ force: true });
    }
  }
}
