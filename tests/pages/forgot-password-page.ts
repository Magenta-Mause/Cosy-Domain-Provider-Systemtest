import type { Page } from '@playwright/test';

export class ForgotPasswordPage {
  constructor(private readonly page: Page) {}

  get emailInput() {
    return this.page.getByTestId('forgot-password-email-input');
  }

  get submitBtn() {
    return this.page.getByTestId('forgot-password-submit-btn');
  }

  get backLink() {
    return this.page.getByTestId('forgot-password-back-link');
  }

  async navigate() {
    await this.page.goto('/forgot-password');
  }

  async requestReset(email: string) {
    await this.emailInput.fill(email);
    await this.submitBtn.click();
  }
}
