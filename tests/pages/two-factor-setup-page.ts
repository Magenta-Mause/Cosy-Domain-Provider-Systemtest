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
    await this.confirmBtn.click();
  }
}
