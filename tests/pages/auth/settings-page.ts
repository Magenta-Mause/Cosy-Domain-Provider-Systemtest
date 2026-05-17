import type { Page } from '@playwright/test';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  get backLink() {
    return this.page.getByTestId('settings-back-link');
  }

  get usernameInput() {
    return this.page.getByTestId('settings-new-username-input');
  }

  get usernameSubmit() {
    return this.page.getByTestId('settings-username-submit-btn');
  }

  get usernameSuccess() {
    return this.page.getByTestId('settings-username-success');
  }

  get currentPasswordInput() {
    return this.page.getByTestId('settings-current-password-input');
  }

  get newPasswordInput() {
    return this.page.getByTestId('settings-new-password-input');
  }

  get confirmPasswordInput() {
    return this.page.getByTestId('settings-confirm-password-input');
  }

  get passwordSubmit() {
    return this.page.getByTestId('settings-password-submit-btn');
  }

  get passwordSuccess() {
    return this.page.getByTestId('settings-password-success');
  }

  async navigate() {
    await this.page.goto('/settings');
  }

  async changePassword(current: string, next: string) {
    await this.currentPasswordInput.fill(current);
    await this.newPasswordInput.fill(next);
    await this.confirmPasswordInput.fill(next);
    await this.passwordSubmit.click();
  }
}
