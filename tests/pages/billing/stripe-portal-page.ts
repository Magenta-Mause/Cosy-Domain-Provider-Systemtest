import type { Page } from '@playwright/test';

export class StripePortalPage {
  constructor(private readonly page: Page) {}

  get cancelPlanLink() {
    return this.page
      .getByRole('link', { name: /cancel (plan|subscription)/i })
      .or(this.page.getByRole('button', { name: /cancel (plan|subscription)/i }))
      .first();
  }

  get confirmCancelButton() {
    return this.page.getByRole('button', { name: /^cancel subscription$/i });
  }

  get returnToAppLink() {
    return this.page.getByRole('link', { name: /return to/i });
  }

  async cancelSubscription() {
    await this.cancelPlanLink.click();

    const surveySkip = this.page.getByRole('button', { name: /no thanks|skip|cancel anyway/i });
    if (await surveySkip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await surveySkip.click();
    }

    await this.confirmCancelButton.click();
  }
}
