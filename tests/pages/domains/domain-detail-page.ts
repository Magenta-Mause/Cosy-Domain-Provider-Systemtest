import type { Page } from '@playwright/test';

export class DomainDetailPage {
  constructor(private readonly page: Page) {}

  get labelInput() {
    return this.page.getByTestId('domain-detail-label-input');
  }

  get targetIpInput() {
    return this.page.getByTestId('domain-detail-target-ip-input');
  }

  // Naming-Mode-Karten im Create-Formular (PlanCard hat keine testid; Buttons
  // mit i18n-Label — Regex deckt EN + DE ab).
  get randomNameCard() {
    return this.page.getByRole('button', { name: /random name|zufällige subdomain/i });
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
