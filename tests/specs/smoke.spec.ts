import { test, expect } from '../fixtures';
import { HomePage } from '@pages/home-page';
import { LoginPage } from '@pages/login-page';
import { RegisterPage } from '@pages/register-page';

test.describe('Smoke Tests', () => {
  test('Startseite lädt und zeigt Hauptüberschrift', async ({ page }) => {
    const home = new HomePage(page);
    await home.navigate();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Login-Seite lädt und zeigt E-Mail-Formular', async ({ page }) => {
    const login = new LoginPage(page);
    await login.navigate();
    await expect(login.emailInput).toBeVisible();
    await expect(login.emailContinueBtn).toBeVisible();
  });

  test('Registrierungsseite lädt und zeigt E-Mail-Formular', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.navigate();
    await expect(register.emailInput).toBeVisible();
    await expect(register.emailContinueBtn).toBeVisible();
  });

  test('Nicht eingeloggte Nutzer werden von /dashboard zu /login weitergeleitet', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
