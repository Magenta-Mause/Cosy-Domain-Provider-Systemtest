import { test, expect } from '../fixtures';
import { LegalPage, type LegalRoute } from '@pages/index';

const ROUTES: ReadonlyArray<{ path: LegalRoute; label: string }> = [
  { path: '/legal-notice', label: 'Impressum' },
  { path: '/privacy', label: 'Datenschutz' },
  { path: '/terms', label: 'AGB' },
];

test.describe('Statische Seiten', () => {
  for (const { path, label } of ROUTES) {
    test(`${label} (${path}) lädt, zeigt H1 und Zurück-Link`, async ({ page }) => {
      const legal = new LegalPage(page, path);
      await legal.navigate();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(legal.heading).toBeVisible();
      await expect(legal.heading).not.toHaveText('');
      await expect(legal.backLink).toBeVisible();

      await legal.backLink.click();
      await expect(page).toHaveURL(/\/$/);
    });
  }
});
