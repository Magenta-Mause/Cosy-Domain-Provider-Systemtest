import type { Page } from '@playwright/test';

export class AdminPage {
  constructor(protected readonly page: Page) {}

  get adminKeyInput() {
    return this.page.getByLabel(/admin-(schlüssel|key)|admin key/i);
  }

  get signInBtn() {
    return this.page.getByRole('button', { name: /sign in|anmelden/i });
  }

  get invalidKeyMessage() {
    return this.page.getByText(/invalid admin key|ungültiger admin-schlüssel/i);
  }

  get heading() {
    return this.page.getByRole('heading', { name: /admin dashboard|admin-dashboard/i });
  }

  get subdomainsTab() {
    return this.page.getByRole('link', { name: /subdomains/i });
  }

  get usersTab() {
    return this.page.getByRole('link', { name: /users|benutzer/i });
  }

  get exitPortalBtn() {
    return this.page.getByRole('button', { name: /exit admin portal|admin-portal verlassen/i });
  }

  async navigate() {
    await this.page.goto('/admin');
  }

  async login(adminKey: string) {
    await this.adminKeyInput.fill(adminKey);
    await this.signInBtn.click();
    await this.page.waitForURL(/\/admin\/subdomains/);
  }

  async loginWithInvalidKey(adminKey: string) {
    await this.adminKeyInput.fill(adminKey);
    await this.signInBtn.click();
  }

  async openUsers() {
    await this.usersTab.click();
    await this.page.waitForURL(/\/admin\/users/);
  }

  async openSubdomains() {
    await this.subdomainsTab.click();
    await this.page.waitForURL(/\/admin\/subdomains/);
  }
}
