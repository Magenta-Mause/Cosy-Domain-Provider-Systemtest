import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  get usernameInput() {
    return this.page.getByTestId('register-username-input');
  }

  get emailInput() {
    return this.page.getByTestId('register-email-input');
  }

  get passwordInput() {
    return this.page.getByTestId('register-password-input');
  }

  get confirmPasswordInput() {
    return this.page.getByTestId('register-confirm-password-input');
  }

  get termsCheckbox() {
    return this.page.getByTestId('register-terms-checkbox');
  }

  get submitBtn() {
    return this.page.getByTestId('register-submit-btn');
  }

  get loginLink() {
    return this.page.getByTestId('register-login-link');
  }

  async navigate() {
    await this.page.goto('/register');
  }

  async register(opts: { username: string; email: string; password: string }) {
    await this.usernameInput.fill(opts.username);
    await this.emailInput.fill(opts.email);
    await this.passwordInput.fill(opts.password);
    await this.confirmPasswordInput.fill(opts.password);
    await this.termsCheckbox.check();
    await this.submitBtn.click();
  }
}
