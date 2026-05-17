import type { Page } from '@playwright/test';

export class StripePortalPage {
  constructor(private readonly page: Page) {}

  get cancelPlanLink() {
    return this.page
      .getByRole('link', { name: /abonnement kündigen|cancel (plan|subscription)/i })
      .or(
        this.page.getByRole('button', {
          name: /abonnement kündigen|cancel (plan|subscription)/i,
        }),
      )
      .first();
  }

  get confirmCancelButton() {
    return this.page
      .getByRole('button', {
        name: /^abonnement kündigen$|^kündigen bestätigen$|^cancel subscription$/i,
      })
      .last();
  }

  get returnToAppLink() {
    return this.page.getByRole('link', { name: /zurück zu|return to/i }).first();
  }

  get cancellationNotice() {
    return this.page
      .getByText(
        /abonnement wurde gekündigt|wird (am .+ )?gekündigt|endet am|subscription canceled|will be canceled|cancels on/i,
      )
      .first();
  }

  async cancelSubscription() {
    await this.cancelPlanLink.click();
    await this.confirmCancelButton.click();
  }

  async dismissFeedbackSurvey() {
    const feedbackSkip = this.page.getByRole('button', {
      name: /nein,? danke|überspringen|no thanks|skip/i,
    });
    if (await feedbackSkip.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await feedbackSkip.click();
    }
  }
}
