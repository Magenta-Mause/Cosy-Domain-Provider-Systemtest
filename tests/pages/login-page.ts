import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  // Step 1 — E-Mail-Eingabe
  get emailInput() {
    return this.page.getByTestId('login-email-input');
  }

  get emailContinueBtn() {
    return this.page.getByTestId('login-email-continue-btn');
  }

  get oauthGoogleBtn() {
    return this.page.getByTestId('login-oauth-google-btn');
  }

  get oauthGithubBtn() {
    return this.page.getByTestId('login-oauth-github-btn');
  }

  get oauthDiscordBtn() {
    return this.page.getByTestId('login-oauth-discord-btn');
  }

  // Step 2 — Passwort-Eingabe
  get passwordInput() {
    return this.page.getByTestId('login-password-input');
  }

  get submitBtn() {
    return this.page.getByTestId('login-submit-btn');
  }

  get togglePasswordBtn() {
    return this.page.getByTestId('login-toggle-password-btn');
  }

  get forgotPasswordLink() {
    return this.page.getByTestId('login-forgot-password-link');
  }

  get mfaTotpInput() {
    return this.page.getByTestId('login-totp-input');
  }

  get mfaBackBtn() {
    return this.page.getByTestId('login-mfa-back-btn');
  }

  get backBtn() {
    return this.page.getByTestId('login-back-btn');
  }

  // Shared
  get registerLink() {
    return this.page.getByTestId('login-register-link-footer');
  }

  async navigate() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.emailContinueBtn.click();
    await this.passwordInput.waitFor({ state: 'visible' });
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/login'));
  }

  async submitCredentialsForMfa(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.emailContinueBtn.click();
    await this.passwordInput.waitFor({ state: 'visible' });
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    await this.mfaTotpInput.waitFor({ state: 'visible' });
  }

  async completeMfa(code: string) {
    await this.mfaTotpInput.fill(code);
    await this.page.waitForURL((url) => !url.pathname.includes('/login'));
  }
}
