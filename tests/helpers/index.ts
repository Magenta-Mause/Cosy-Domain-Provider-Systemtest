import type { BrowserContext, Page } from '@playwright/test';

export { MailService } from './mail-service';
export { STRIPE_TEST_CARD } from './stripe-test-data';
export { generateTotpCode } from './totp';
export {
  requireRuntimeTestUser,
  readRuntimeTestUserState,
  recordCleanupUser,
  updateCleanupUser,
  APP_USER_STATE_PATH,
  TEST_USER_STATE_PATH,
} from './runtime-test-user';
export type { CleanupTestUser, RuntimeTestUser, RuntimeTestUserState } from './runtime-test-user';

export function generateSubdomain(): string {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTestEmail(domain = 'example.org'): string {
  return `playwright-${Date.now()}@${domain}`;
}

export async function waitForApiIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

export async function enableCaptchaBypass(context: BrowserContext): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
  await context.addCookies([
    {
      name: 'CAPTCHA_BYPASS',
      value: '1',
      domain: new URL(baseUrl).hostname,
      path: '/',
    },
  ]);
  await stubTurnstile(context);
}

/**
 * Stubbt das Cloudflare-Turnstile-Widget im Browser. Der echte (Production-)Sitekey
 * löst headless nicht, wodurch der Login-/Register-Submit dauerhaft `disabled` bliebe.
 * Der Stub liefert sofort das Token "BYPASS", das der Backend-CaptchaService bei
 * gesetztem CAPTCHA_BYPASS-Cookie akzeptiert — so wird UI-Auth headless testbar.
 */
async function stubTurnstile(context: BrowserContext): Promise<void> {
  await context.route(/challenges\.cloudflare\.com\/turnstile\/.*\/api\.js.*/, async (route) => {
    const onload =
      new URL(route.request().url()).searchParams.get('onload') ?? 'onloadTurnstileCallback';
    const body = `
      window.turnstile = {
        render: function (_el, opts) {
          setTimeout(function () {
            if (opts && typeof opts.callback === 'function') opts.callback('BYPASS');
          }, 0);
          return 'turnstile-stub-widget';
        },
        execute: function (_el, opts) {
          if (opts && typeof opts.callback === 'function') opts.callback('BYPASS');
        },
        reset: function () {},
        remove: function () {},
        getResponse: function () { return 'BYPASS'; }
      };
      if (typeof window[${JSON.stringify(onload)}] === 'function') {
        window[${JSON.stringify(onload)}]();
      }
    `;
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body,
    });
  });
}
