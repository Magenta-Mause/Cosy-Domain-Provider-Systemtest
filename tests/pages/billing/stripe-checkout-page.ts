import type { Page } from '@playwright/test';
import { STRIPE_TEST_CARD } from '@helpers/index';

export class StripeCheckoutPage {
  constructor(private readonly page: Page) {}

  get emailInput() {
    return this.page.getByRole('textbox', { name: /e-?mail/i });
  }

  get cardNumberInput() {
    return this.page.getByRole('textbox', { name: /kartennummer|card number/i });
  }

  get expiryInput() {
    return this.page.getByRole('textbox', { name: /gültig bis|ablauf|expiration|expiry/i });
  }

  get cvcInput() {
    return this.page.getByRole('textbox', { name: /prüfziffer|sicherheitscode|cvc|cvv/i });
  }

  get cardholderNameInput() {
    return this.page.getByRole('textbox', { name: /karteninhaber|cardholder|name on card/i });
  }

  get postalCodeInput() {
    return this.page.getByRole('textbox', { name: /postleitzahl|zip|postal/i });
  }

  get submitButton() {
    return this.page
      .getByRole('button', { name: /zahlungspflichtig abonnieren|subscribe|pay now/i })
      .last();
  }

  get aiAgentCheckbox() {
    return this.page.getByRole('checkbox', { name: /ai agent/i });
  }

  // Seit Stripe neben Karte weitere Methoden (z. B. Klarna) anbietet, ist keine
  // vorausgewählt. Die Auswahl ist eine Akkordeon-Zeile ohne Radio-Rolle; ein
  // transparenter Button liegt über der ganzen Zeile und fängt die Klicks ab.
  get cardAccordionButton() {
    return this.page.getByTestId('card-accordion-item-button');
  }

  async completeSubscription(opts: { email: string; name?: string }) {
    if ((await this.cardAccordionButton.count()) > 0) {
      // Der Button hat keine brauchbare Bounding-Box ("outside of the viewport"),
      // deshalb Klick-Event direkt statt Mausklick.
      await this.cardAccordionButton.dispatchEvent('click');
    }

    if (await this.emailInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await this.emailInput.fill(opts.email);
    }

    await this.cardNumberInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.cardNumberInput.fill(STRIPE_TEST_CARD.number);
    await this.expiryInput.fill(STRIPE_TEST_CARD.expiry);
    await this.cvcInput.fill(STRIPE_TEST_CARD.cvc);

    if (await this.cardholderNameInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await this.cardholderNameInput.fill(opts.name ?? 'Playwright Test');
    }
    if (await this.postalCodeInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await this.postalCodeInput.fill(STRIPE_TEST_CARD.postalCode);
    }

    await this.acknowledgeAiAgent();
    await this.submitButton.click();
  }

  private async acknowledgeAiAgent() {
    const checkbox = this.aiAgentCheckbox;
    const exists = (await checkbox.count().catch(() => 0)) > 0;
    if (!exists) return;
    if (await checkbox.isChecked().catch(() => false)) return;

    const label = this.page.getByText(/i am an ai agent acting on behalf of someone else/i).first();
    await label.scrollIntoViewIfNeeded().catch(() => undefined);
    await label.click({ force: true }).catch(() => undefined);

    if (!(await checkbox.isChecked().catch(() => false))) {
      await checkbox.setChecked(true, { force: true }).catch(() => undefined);
    }
  }
}
