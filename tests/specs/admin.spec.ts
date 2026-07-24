import { test, expect, runsOnlyWithEnv } from '../fixtures';
import { AdminPage, AdminSubdomainsPage, AdminUsersPage } from '@pages/index';

test.describe('Admin-Portal', () => {
  runsOnlyWithEnv('ADMIN_PORTAL_API_KEY', 'Admin-Portal-Tests');

  test('Ungültiger Admin-Schlüssel wird abgelehnt', async ({ page }) => {
    const admin = new AdminPage(page);

    await test.step('When: sich jemand mit einem ungültigen Schlüssel anmeldet', async () => {
      await admin.navigate();
      await admin.loginWithInvalidKey('invalid-admin-key');
    });

    await test.step('Then: wird er abgewiesen und bleibt auf /admin', async () => {
      await expect(admin.invalidKeyMessage).toBeVisible();
      await expect(page).toHaveURL(/\/admin/);
    });
  });

  test('Admin kann Subdomains- und Nutzerübersicht öffnen', async ({ page }) => {
    const admin = new AdminPage(page);
    const subdomains = new AdminSubdomainsPage(page);
    const users = new AdminUsersPage(page);

    await test.step('Given: ein mit gültigem Schlüssel eingeloggter Admin', async () => {
      await admin.navigate();
      await admin.login(process.env.ADMIN_PORTAL_API_KEY!);
      await expect(admin.heading).toBeVisible();
    });

    await test.step('Then: zeigt die Subdomain-Übersicht Panel, Stats und Spalten', async () => {
      await expect(subdomains.domainCreationPanel).toBeVisible();
      await expect(subdomains.domainCreationStatus).toBeVisible();
      await expect(subdomains.totalStat).toBeVisible();
      await expect(subdomains.failedStat).toBeVisible();
      await expect(subdomains.labelColumnHeader).toBeVisible();
      await expect(subdomains.fqdnColumnHeader).toBeVisible();
      await expect(subdomains.ownerColumnHeader).toBeVisible();
    });

    await test.step('And: die Nutzerübersicht zeigt Stats und Spalten', async () => {
      await admin.openUsers();
      await expect(users.totalStat).toBeVisible();
      await expect(users.unverifiedStat).toBeVisible();
      await expect(users.plusStat).toBeVisible();
      await expect(users.emailColumnHeader).toBeVisible();
      await expect(users.uuidColumnHeader).toBeVisible();
      await expect(users.tierColumnHeader).toBeVisible();
    });

    await test.step('And: der Wechsel zurück zur Subdomain-Übersicht funktioniert', async () => {
      await admin.openSubdomains();
      await expect(subdomains.domainCreationPanel).toBeVisible();
    });
  });
});
