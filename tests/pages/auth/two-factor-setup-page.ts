import type { Page } from '@playwright/test';

export class TwoFactorSetupPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: /secure your account/i });
  }

  get qrCode() {
    return this.page.getByTestId('mfa-qr-code');
  }

  get secret() {
    return this.page.getByTestId('mfa-secret');
  }

  get totpInput() {
    return this.page.getByTestId('mfa-totp-input');
  }

  get confirmBtn() {
    return this.page.getByTestId('mfa-confirm-btn');
  }

  async navigate() {
    await this.page.goto('/mfa-setup');
  }

  async confirm(code: string) {
    await this.totpInput.fill(code);
    // Das OTP-Feld submittet automatisch, sobald 6 Ziffern eingegeben sind
    // (useMfaSetupLogic-useEffect) und navigiert weiter. Ein erzwungener
    // Button-Klick würde mit dieser Navigation racen (Button ist dann
    // "Verifying..."/detached). Nur als Fallback klicken, falls der Auto-Submit
    // (z.B. nach einem künftigen Refactor) nicht greift.
    await this.confirmBtn.click({ timeout: 3_000 }).catch(() => undefined);
  }
}
