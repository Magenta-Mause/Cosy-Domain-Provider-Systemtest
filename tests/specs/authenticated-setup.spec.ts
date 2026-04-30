import { test, expect } from '../fixtures';

test.describe('Authentifizierter Test-Setup', () => {
  test('Setup-Testuser kann sich anmelden', async ({ authenticatedPage }) => {
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });
});
