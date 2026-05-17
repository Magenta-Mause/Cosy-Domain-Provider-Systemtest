import { test, expect } from '../fixtures';
import { DashboardPage, DomainDetailPage } from '@pages/index';

const UUID_RE = /\/domain\/([0-9a-f-]{8,})/i;

test.describe('Domain-CRUD', () => {
  test.skip(
    !/staging|cosy-hosting\.net/i.test(process.env.BASE_URL ?? ''),
    'Domain-CRUD braucht funktionierendes AWS Route53 — läuft nur gegen Staging, nicht lokal.',
  );

  test('Subdomain anlegen, IPv4 ändern und löschen', async ({ authenticatedPage: page }) => {
    const dashboard = new DashboardPage(page);
    const detail = new DomainDetailPage(page);

    await dashboard.navigate();
    await dashboard.createNewBtn.click();
    await expect(page).toHaveURL(/\/domain\/new$/);

    await detail.targetIpInput.fill('1.2.3.4');
    await detail.submitBtn.click();

    await page.waitForURL(
      (url) => UUID_RE.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 20_000 },
    );
    const uuid = page.url().match(UUID_RE)?.[1];
    expect(uuid).toBeTruthy();

    await dashboard.navigate();
    await expect(dashboard.domainItem(uuid!)).toBeVisible();

    await dashboard.openDomain(uuid!);
    await detail.targetIpInput.fill('5.6.7.8');
    await detail.save();
    await expect(detail.targetIpInput).toHaveValue('5.6.7.8');

    await detail.switchTab('danger');
    page.once('dialog', (dialog) => dialog.accept());
    await detail.delete();

    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(dashboard.domainItem(uuid!)).toHaveCount(0);
  });
});
