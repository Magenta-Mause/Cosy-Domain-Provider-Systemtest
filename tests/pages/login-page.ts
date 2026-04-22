import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  get usernameInput() {
    return this.page.getByTestId('login-username-input');
  }

  get passwordInput() {
    return this.page.getByTestId('login-password-input');
  }

  get submitBtn() {
    return this.page.getByTestId('login-submit-btn');
  }

  get registerLink() {
    return this.page.getByTestId('login-register-link').first();
  }

  get togglePasswordBtn() {
    return this.page.getByTestId('login-toggle-password-btn');
  }

  async navigate() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/login'));
  }
}
