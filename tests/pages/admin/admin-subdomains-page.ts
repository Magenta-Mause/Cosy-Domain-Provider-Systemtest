import type { Page } from '@playwright/test';
import { AdminPage } from './admin-page';

export class AdminSubdomainsPage extends AdminPage {
  constructor(page: Page) {
    super(page);
  }

  get domainCreationPanel() {
    return this.page.getByText(/domain creation|domain-registrierung/i);
  }

  get domainCreationStatus() {
    return this.page.getByText(/enabled|disabled|aktiviert|deaktiviert/i).first();
  }

  get totalStat() {
    return this.page.getByText(/total/i).first();
  }

  get failedStat() {
    return this.page.getByText(/failed/i).first();
  }

  get labelColumnHeader() {
    return this.page.getByText(/^label$/i).first();
  }

  get fqdnColumnHeader() {
    return this.page.getByText(/^fqdn$/i).first();
  }

  get ownerColumnHeader() {
    return this.page.getByText(/^owner$/i).first();
  }

  async navigate() {
    await this.page.goto('/admin/subdomains');
  }
}
