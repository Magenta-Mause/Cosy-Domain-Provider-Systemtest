import { test, expect } from '../fixtures';

test.describe('Redux Counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('startet bei 0', async ({ page }) => {
    await expect(page.getByText('0')).toBeVisible();
  });

  test('increment erhöht den Zähler um 1', async ({ page }) => {
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('1')).toBeVisible();
  });

  test('decrement verringert den Zähler um 1', async ({ page }) => {
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Decrement' }).click();
    await expect(page.getByText('1')).toBeVisible();
  });

  test('decrement geht auch in den negativen Bereich', async ({ page }) => {
    await page.getByRole('button', { name: 'Decrement' }).click();
    await expect(page.getByText('-1')).toBeVisible();
  });

  test('reset setzt den Zähler auf 0 zurück', async ({ page }) => {
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('0')).toBeVisible();
  });

  test('reset nach negativen Werten setzt auf 0 zurück', async ({ page }) => {
    await page.getByRole('button', { name: 'Decrement' }).click();
    await page.getByRole('button', { name: 'Decrement' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('0')).toBeVisible();
  });

  test('mehrere increments und decrements in Folge', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Increment' }).click();
    }
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Decrement' }).click();
    }
    await expect(page.getByText('2')).toBeVisible();
  });
});
