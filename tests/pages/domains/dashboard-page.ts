import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  get createNewBtn() {
    return this.page.getByTestId('dashboard-create-new-btn');
  }

  filterBtn(status: string) {
    return this.page.getByTestId(`dashboard-filter-${status}-btn`);
  }

  domainItem(uuid: string) {
    return this.page.getByTestId(`dashboard-domain-item-${uuid}`);
  }

  async navigate() {
    await this.page.goto('/dashboard');
  }

  async filterBy(status: string) {
    await this.filterBtn(status).click();
  }

  async openDomain(uuid: string) {
    await this.domainItem(uuid).click();
    await this.page.waitForURL(/\/domain\//);
  }
}
