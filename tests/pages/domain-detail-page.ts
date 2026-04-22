import type { Page } from '@playwright/test';

export class DomainDetailPage {
  constructor(private readonly page: Page) {}

  get labelInput() {
    return this.page.getByTestId('domain-detail-label-input');
  }

  get targetIpInput() {
    return this.page.getByTestId('domain-detail-target-ip-input');
  }

  get submitBtn() {
    return this.page.getByTestId('domain-detail-submit-btn');
  }

  get deleteBtn() {
    return this.page.getByTestId('domain-detail-delete-btn');
  }

  get backLink() {
    return this.page.getByTestId('domain-detail-back-link');
  }

  tab(key: string) {
    return this.page.getByTestId(`domain-detail-tab-${key}-btn`);
  }

  async switchTab(key: string) {
    await this.tab(key).click();
  }

  async save() {
    await this.submitBtn.click();
  }

  async delete() {
    await this.deleteBtn.click();
  }
}
