import type { Page } from '@playwright/test';
import { AdminPage } from './admin-page';

export class AdminUsersPage extends AdminPage {
  constructor(page: Page) {
    super(page);
  }

  get totalStat() {
    return this.page.getByText(/registered users|registrierte benutzer/i).first();
  }

  get unverifiedStat() {
    return this.page.getByText(/pending email verification|ausstehende e-mail/i).first();
  }

  get plusStat() {
    return this.page.getByText(/plus tier|cosy\+/i).first();
  }

  get emailColumnHeader() {
    return this.page.getByText(/^email|e-mail$/i).first();
  }

  get uuidColumnHeader() {
    return this.page.getByText(/^uuid$/i).first();
  }

  get tierColumnHeader() {
    return this.page.getByText(/^tier|tarif$/i).first();
  }

  async navigate() {
    await this.page.goto('/admin/users');
  }
}
