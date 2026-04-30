import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  get loginLink() {
    return this.page.getByTestId('home-login-link');
  }

  get signupLink() {
    return this.page.getByTestId('home-signup-link');
  }

  get subdomainInput() {
    return this.page.getByTestId('home-subdomain-input');
  }

  get checkBtn() {
    return this.page.getByTestId('home-check-btn');
  }

  get registerFreeLink() {
    return this.page.getByTestId('home-register-free-link');
  }

  get registerPlusLink() {
    return this.page.getByTestId('home-register-plus-link');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async checkSubdomain(name: string) {
    await this.subdomainInput.fill(name);
    await this.checkBtn.click();
  }
}
