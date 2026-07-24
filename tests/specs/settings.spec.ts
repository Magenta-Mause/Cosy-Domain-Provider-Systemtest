import { test, expect } from '../fixtures';
import { SettingsPage } from '@pages/index';

test.describe('Settings', () => {
  test('Username ändern zeigt Erfolgsmeldung', async ({ authenticatedPage: page, appTestUser }) => {
    const settings = new SettingsPage(page);
    const tempUsername = `user-${Date.now().toString(36)}`;

    await test.step('Given: die Settings-Seite des eingeloggten Setup-Users', async () => {
      await settings.navigate();
    });

    try {
      await test.step('When: der Username geändert wird', async () => {
        await settings.usernameInput.fill(tempUsername);
        await settings.usernameSubmit.click();
      });

      await test.step('Then: erscheint die Erfolgsmeldung', async () => {
        await expect(settings.usernameSuccess).toBeVisible();
      });
    } finally {
      // Ursprünglichen Username wiederherstellen — der Setup-User wird von anderen
      // Specs im selben Lauf weiterverwendet.
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

    await test.step('Given: die Settings-Seite des eingeloggten Setup-Users', async () => {
      await settings.navigate();
    });

    try {
      await test.step('When: das Passwort geändert wird', async () => {
        await settings.changePassword(appTestUser.password, newPassword);
      });

      await test.step('Then: erscheint die Erfolgsmeldung', async () => {
        await expect(settings.passwordSuccess).toBeVisible();
        passwordChanged = true;
      });

      await test.step('And: das Zurückändern funktioniert genauso', async () => {
        await page.reload();
        await settings.changePassword(newPassword, appTestUser.password);
        await expect(settings.passwordSuccess).toBeVisible();
        passwordChanged = false;
      });
    } finally {
      // Sicherheitsnetz: Setup-User nie mit geändertem Passwort zurücklassen,
      // sonst scheitern die nachfolgenden Specs am Login.
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
