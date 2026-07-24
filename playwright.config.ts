import { defineConfig, devices } from '@playwright/test';
import { resolveBaseURL } from './tests/helpers/constants';

const BASE_URL = resolveBaseURL();

export default defineConfig({
  testDir: './tests/specs',
  globalSetup: require.resolve('./tests/global-setup'),
  globalTeardown: require.resolve('./tests/global-teardown'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Gegen Staging immer mind. 1 Retry: fängt transiente Blips (langsames/kurz nicht
  // erreichbares Staging im nightly) ab, ohne dass die ganze Suite rot wird.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],

  use: {
    baseURL: BASE_URL,
    storageState: '.auth/state.json',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: process.env.RECORD_VIDEO === '1' ? 'on' : 'retain-on-failure',
    locale: 'de-DE',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox und WebKit erst dazunehmen wenn Chromium-Tests stabil laufen
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Lokaler Dev-Server — auskommentieren wenn gegen deployed env getestet wird
  // webServer: {
  //   command: 'npm run dev',
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
