import type { Page } from '@playwright/test';

export class VerifyPage {
  constructor(private readonly page: Page) {}

  get codeInput() {
    return this.page.getByTestId('verify-code-input');
  }

  get submitBtn() {
    return this.page.getByTestId('verify-submit-btn');
  }

  get successMessage() {
    return this.page.getByTestId('verify-success-message');
  }

  async navigateWithToken(token: string) {
    await this.page.goto(`/verify?token=${token}`);
  }

  async verifyWithCode(code: string) {
    await this.codeInput.fill(code);
    // Filling 6 chars triggers auto-submit; no manual click needed
  }
}
