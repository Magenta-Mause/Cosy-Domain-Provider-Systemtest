import type { Page } from '@playwright/test';

export class ResetPasswordPage {
  constructor(private readonly page: Page) {}

  get passwordInput() {
    return this.page.getByTestId('reset-password-input');
  }

  get submitBtn() {
    return this.page.getByTestId('reset-password-submit-btn');
  }

  get backLink() {
    return this.page.getByTestId('reset-password-back-link');
  }

  get invalidOrExpiredMessage() {
    return this.page.getByText(/this link is invalid or has expired/i);
  }

  async navigateWithToken(token: string) {
    await this.page.goto(`/reset-password?token=${token}`);
  }

  async resetPassword(password: string) {
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
  }
}
