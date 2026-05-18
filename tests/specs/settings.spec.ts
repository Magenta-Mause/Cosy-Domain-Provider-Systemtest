import { test, expect } from '../fixtures';
import { SettingsPage } from '@pages/index';

test.describe('Settings', () => {
  test('Username ändern zeigt Erfolgsmeldung', async ({ authenticatedPage: page, appTestUser }) => {
    const settings = new SettingsPage(page);
    const tempUsername = `user-${Date.now().toString(36)}`;

    await settings.navigate();

    try {
      await settings.usernameInput.fill(tempUsername);
      await settings.usernameSubmit.click();
      await expect(settings.usernameSuccess).toBeVisible();
    } finally {
      try {
        await page.reload();
        await settings.usernameInput.fill(appTestUser.username);
        await settings.usernameSubmit.click();
        await expect(settings.usernameSuccess).toBeVisible({ timeout: 10_000 });
      } catch (restoreError) {
        console.warn(`Username-Restore fehlgeschlagen: ${restoreError}`);
      }
    }
  });

  test('Passwort ändern zeigt Erfolgsmeldung (und stellt altes Passwort wieder her)', async ({
    authenticatedPage: page,
    appTestUser,
  }) => {
    const settings = new SettingsPage(page);
    const newPassword = `${appTestUser.password}-X`;
    let passwordChanged = false;

    await settings.navigate();

    try {
      await settings.changePassword(appTestUser.password, newPassword);
      await expect(settings.passwordSuccess).toBeVisible();
      passwordChanged = true;

      await page.reload();
      await settings.changePassword(newPassword, appTestUser.password);
      await expect(settings.passwordSuccess).toBeVisible();
      passwordChanged = false;
    } finally {
      if (passwordChanged) {
        try {
          await page.reload();
          await settings.changePassword(newPassword, appTestUser.password);
          await expect(settings.passwordSuccess).toBeVisible({ timeout: 10_000 });
        } catch (restoreError) {
          console.warn(`Passwort-Restore fehlgeschlagen: ${restoreError}`);
        }
      }
    }
  });
});
