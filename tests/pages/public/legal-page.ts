import type { Page } from '@playwright/test';

export type LegalRoute = '/legal-notice' | '/privacy' | '/terms';

export class LegalPage {
  constructor(
    private readonly page: Page,
    private readonly path: LegalRoute,
  ) {}

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  get backLink() {
    return this.page.getByTestId('legal-back-link');
  }

  async navigate() {
    await this.page.goto(this.path);
  }
}
