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

    // Nach dem Klick wechselt Stripe die Seite ("Kündigung bestätigen") und blendet
    // das Grund-Modal ein — beides braucht einige Sekunden. Erst darauf warten,
    // sonst läuft die Schleife unten ins Leere.
    const reasonPrompt = this.page
      .getByText(/option auswählen|select (a )?(reason|option)|warum sie gehen|why.*leaving/i)
      .filter({ visible: true })
      .first();
    await Promise.race([
      reasonPrompt.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
      this.confirmCancelButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    ]);

    // Die Stripe-Kündigung (Sandbox) ist mehrstufig: eine Grund-Abfrage (Modal mit
    // Reason-Select + "Weiter zur Kündigung") und eine finale Bestätigung
    // ("Abonnement kündigen"). Solange das Grund-Modal offen ist, überdeckt es den
    // Bestätigen-Button. Beide Schritte geduldig abarbeiten, bis der Hinweis kommt.
    for (let step = 0; step < 6; step++) {
      if (await this.cancellationNotice.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return;
      }

      await this.selectCancellationReason();

      const proceed = this.page
        .getByRole('button', {
          name: /weiter zur kündigung|kündigung fortsetzen|continue|proceed/i,
        })
        .filter({ visible: true })
        .first();
      if (await proceed.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await proceed.click().catch(() => undefined);
        await this.page.waitForTimeout(1_000);
        continue;
      }

      if (await this.confirmCancelButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await this.confirmCancelButton.click().catch(() => undefined);
        await this.page.waitForTimeout(1_000);
        continue;
      }

      // Nichts aktionierbar — dem UI Zeit geben statt sofort abzubrechen.
      await this.page.waitForTimeout(1_500);
    }
  }

  /**
   * Stripe verlangt im Kündigungs-Flow (Sandbox) einen Grund. Das Control ist ein
   * React-Aria-Select: ein sichtbarer Trigger-Button "Reason" öffnet eine Listbox.
   * Wichtig: Das von React Aria zusätzlich gerenderte versteckte native <select>
   * spiegelt den State nur einseitig — `selectOption` darauf ändert die UI NICHT.
   * Daher zwingend über Button + Listbox-Option gehen.
   */
  private async selectCancellationReason(): Promise<void> {
    const placeholder = /option auswählen|select (a )?(reason|option)|choose/i;

    // Trigger über den sichtbaren Platzhalter-Text ansteuern (der React-Aria-Button
    // trägt keinen verlässlichen Accessible Name; nach Auswahl ändert sich der Text,
    // wodurch dieser Schritt automatisch idempotent ist). `visible: true` ist
    // entscheidend — das native HiddenSelect hat ebenfalls eine "Option auswählen".
    const trigger = this.page.getByText(placeholder).filter({ visible: true }).first();
    if (await trigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await trigger.click().catch(() => undefined);

      // Nur SICHTBARE Optionen der geöffneten Listbox — das versteckte native
      // <select> (React-Aria-HiddenSelect) hat ebenfalls role=option.
      const visibleOption = this.page
        .locator('[role="option"]:visible')
        .filter({ hasNotText: placeholder })
        .first();
      if (await visibleOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await visibleOption.click().catch(() => undefined);
        return;
      }

      // Tastatur-Fallback (React-Aria-Select unterstützt das nativ).
      await this.page.keyboard.press('ArrowDown').catch(() => undefined);
      await this.page.keyboard.press('Enter').catch(() => undefined);
      return;
    }

    // Fallback: echtes natives <select> (andere Stripe-Account/Variante).
    const nativeSelect = this.page.getByRole('combobox').first();
    if (await nativeSelect.isVisible({ timeout: 500 }).catch(() => false)) {
      await nativeSelect.selectOption({ index: 1 }).catch(() => undefined);
    }
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
