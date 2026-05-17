import { test, expect } from '../fixtures';
import { SettingsPage } from '@pages/index';

test.describe('Settings', () => {
  test('Username ändern zeigt Erfolgsmeldung', async ({ authenticatedPage: page }) => {
    const settings = new SettingsPage(page);
    await settings.navigate();

    await settings.usernameInput.fill(`user-${Date.now().toString(36)}`);
    await settings.usernameSubmit.click();

    await expect(settings.usernameSuccess).toBeVisible();
  });

  test('Passwort ändern zeigt Erfolgsmeldung (und stellt altes Passwort wieder her)', async ({
    authenticatedPage: page,
    appTestUser,
  }) => {
    const settings = new SettingsPage(page);
    const newPassword = `${appTestUser.password}-X`;

    await settings.navigate();
    await settings.changePassword(appTestUser.password, newPassword);
    await expect(settings.passwordSuccess).toBeVisible();

    await page.reload();
    await settings.changePassword(newPassword, appTestUser.password);
    await expect(settings.passwordSuccess).toBeVisible();
  });
});
