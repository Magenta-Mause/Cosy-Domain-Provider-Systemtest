import { test, expect } from '../fixtures';
import { AdminPage, AdminSubdomainsPage, AdminUsersPage } from '@pages/index';

test.describe('Admin-Portal', () => {
  test.skip(
    process.env.RUN_ADMIN_TESTS !== '1',
    'Admin-Portal-Tests laufen nur mit RUN_ADMIN_TESTS=1.',
  );

  test.skip(
    !process.env.ADMIN_PORTAL_API_KEY,
    'ADMIN_PORTAL_API_KEY nicht gesetzt — Admin-Portal-Tests übersprungen',
  );

  test('Ungültiger Admin-Schlüssel wird abgelehnt', async ({ page }) => {
    const admin = new AdminPage(page);

    await admin.navigate();
    await admin.loginWithInvalidKey('invalid-admin-key');

    await expect(admin.invalidKeyMessage).toBeVisible();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Admin kann Subdomains- und Nutzerübersicht öffnen', async ({ page }) => {
    const admin = new AdminPage(page);
    const subdomains = new AdminSubdomainsPage(page);
    const users = new AdminUsersPage(page);

    await admin.navigate();
    await admin.login(process.env.ADMIN_PORTAL_API_KEY!);

    await expect(admin.heading).toBeVisible();
    await expect(subdomains.domainCreationPanel).toBeVisible();
    await expect(subdomains.domainCreationStatus).toBeVisible();
    await expect(subdomains.totalStat).toBeVisible();
    await expect(subdomains.failedStat).toBeVisible();
    await expect(subdomains.labelColumnHeader).toBeVisible();
    await expect(subdomains.fqdnColumnHeader).toBeVisible();
    await expect(subdomains.ownerColumnHeader).toBeVisible();

    await admin.openUsers();
    await expect(users.totalStat).toBeVisible();
    await expect(users.unverifiedStat).toBeVisible();
    await expect(users.plusStat).toBeVisible();
    await expect(users.emailColumnHeader).toBeVisible();
    await expect(users.uuidColumnHeader).toBeVisible();
    await expect(users.tierColumnHeader).toBeVisible();

    await admin.openSubdomains();
    await expect(subdomains.domainCreationPanel).toBeVisible();
  });
});
