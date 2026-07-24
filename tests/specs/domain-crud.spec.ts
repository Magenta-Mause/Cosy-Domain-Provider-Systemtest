import { test, expect, runsOnlyAgainstStaging } from '../fixtures';
import { DashboardPage, DomainDetailPage } from '@pages/index';
import { fetchSubdomain, resolveAuthoritativeA } from '@helpers/index';

const UUID_RE = /\/domain\/([0-9a-f-]{8,})/i;
const INITIAL_IP = '1.2.3.4';
const UPDATED_IP = '5.6.7.8';

// Route53 propagiert auf die eigenen Nameserver in Sekunden — das Budget deckt
// zusätzlich die asynchrone Provisionierung durchs Backend ab.
const DNS_POLL = { timeout: 120_000, intervals: [2_000, 5_000] };

test.describe('Domain-CRUD', () => {
  runsOnlyAgainstStaging(
    'Domain-CRUD braucht funktionierendes AWS Route53 — läuft nur gegen Staging, nicht lokal.',
  );

  // Bis zu drei DNS-Polls à max. 2 Minuten plus UI-Schritte.
  test.describe.configure({ timeout: 420_000 });

  test('Subdomain anlegen, IPv4 ändern und löschen', async ({ authenticatedPage: page }) => {
    const dashboard = new DashboardPage(page);
    const detail = new DomainDetailPage(page);

    const uuid = await test.step('Given: eine über das Dashboard neu angelegte Subdomain', async () => {
      await dashboard.navigate();
      await dashboard.createNewBtn.click();
      await expect(page).toHaveURL(/\/domain\/new$/);

      await detail.targetIpInput.fill(INITIAL_IP);
      await detail.submitBtn.click();

      await page.waitForURL(
        (url) => UUID_RE.test(url.pathname) && !url.pathname.endsWith('/new'),
        { timeout: 20_000 },
      );
      const id = page.url().match(UUID_RE)?.[1];
      expect(id).toBeTruthy();
      return id!;
    });

    const fqdn = await test.step('And: das Backend kennt ihre FQDN', async () => {
      const subdomain = await fetchSubdomain(page.request, uuid);
      expect(subdomain.fqdn, 'Subdomain sollte eine FQDN haben').toBeTruthy();
      return subdomain.fqdn!;
    });

    await test.step('Then: erscheint sie im Dashboard', async () => {
      await dashboard.navigate();
      await expect(dashboard.domainItem(uuid)).toBeVisible();
    });

    await test.step(`Then: existiert der A-Record ${INITIAL_IP} auf den autoritativen Nameservern`, async () => {
      await expect(async () => {
        expect(await resolveAuthoritativeA(fqdn)).toEqual([INITIAL_IP]);
      }).toPass(DNS_POLL);
    });

    await test.step('When: die Ziel-IP geändert wird, Then: ist sie gespeichert', async () => {
      await dashboard.openDomain(uuid);
      await detail.targetIpInput.fill(UPDATED_IP);
      await detail.save();
      await expect(detail.targetIpInput).toHaveValue(UPDATED_IP);
    });

    await test.step(`Then: zeigt der DNS-Record auf die neue IP ${UPDATED_IP}`, async () => {
      await expect(async () => {
        expect(await resolveAuthoritativeA(fqdn)).toEqual([UPDATED_IP]);
      }).toPass(DNS_POLL);
    });

    await test.step('When: die Subdomain gelöscht wird, Then: verschwindet sie aus dem Dashboard', async () => {
      await detail.switchTab('danger');
      page.once('dialog', (dialog) => dialog.accept());
      await detail.delete();

      await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
      await expect(dashboard.domainItem(uuid)).toHaveCount(0);
    });

    await test.step('Then: ist der DNS-Record von den Nameservern entfernt', async () => {
      await expect(async () => {
        expect(await resolveAuthoritativeA(fqdn)).toEqual([]);
      }).toPass(DNS_POLL);
    });
  });
});
