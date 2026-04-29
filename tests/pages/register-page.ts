import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  // Step 1 — E-Mail-Eingabe
  get emailInput() {
    return this.page.getByTestId('register-email-input');
  }

  get emailContinueBtn() {
    return this.page.getByTestId('register-email-continue-btn');
  }

  get oauthGoogleBtn() {
    return this.page.getByTestId('register-oauth-google-btn');
  }

  get oauthGithubBtn() {
    return this.page.getByTestId('register-oauth-github-btn');
  }

  get oauthDiscordBtn() {
    return this.page.getByTestId('register-oauth-discord-btn');
  }

  // Step 2 — Account-Details
  // ⚠️  Cloudflare Turnstile blockiert den Submit in headless mode.
  //     Der Button bleibt disabled bis das Turnstile-Token vorliegt.
  get usernameInput() {
    return this.page.getByTestId('register-username-input');
  }

  get passwordInput() {
    return this.page.getByTestId('register-password-input');
  }

  get togglePasswordBtn() {
    return this.page.getByTestId('register-toggle-password-btn');
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

  get backBtn() {
    return this.page.getByTestId('register-back-btn');
  }

  // Shared
  get loginLink() {
    return this.page.getByTestId('register-login-link');
  }

  async navigate() {
    await this.page.goto('/register');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
    await this.emailContinueBtn.click();
    await this.usernameInput.waitFor({ state: 'visible' });
  }

  async fillDetails(opts: { username: string; password: string }) {
    await this.usernameInput.fill(opts.username);
    await this.passwordInput.fill(opts.password);
    await this.confirmPasswordInput.fill(opts.password);
    await this.termsCheckbox.click();
  }

  async register(opts: { email: string; username: string; password: string }) {
    await this.fillEmail(opts.email);
    await this.fillDetails(opts);
    await this.submitBtn.click();
  }
}
