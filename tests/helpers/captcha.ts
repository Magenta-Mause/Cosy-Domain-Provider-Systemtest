import type { BrowserContext } from '@playwright/test';
import { CAPTCHA_BYPASS_COOKIE, CAPTCHA_BYPASS_TOKEN, resolveBaseURL } from './constants';

/**
 * Aktiviert den Captcha-Bypass für einen Browser-Context: setzt das
 * CAPTCHA_BYPASS-Cookie (Backend-Seite) und stubbt das Turnstile-Widget
 * (Frontend-Seite), damit UI-Auth headless testbar ist.
 */
export async function enableCaptchaBypass(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: CAPTCHA_BYPASS_COOKIE,
      value: '1',
      domain: new URL(resolveBaseURL()).hostname,
      path: '/',
    },
  ]);
  await stubTurnstile(context);
}

/**
 * Stubbt das Cloudflare-Turnstile-Widget im Browser. Der echte (Production-)Sitekey
 * löst headless nicht, wodurch der Login-/Register-Submit dauerhaft `disabled` bliebe.
 * Der Stub liefert sofort das Bypass-Token, das der Backend-CaptchaService bei
 * gesetztem CAPTCHA_BYPASS-Cookie akzeptiert — so wird UI-Auth headless testbar.
 */
async function stubTurnstile(context: BrowserContext): Promise<void> {
  await context.route(/challenges\.cloudflare\.com\/turnstile\/.*\/api\.js.*/, async (route) => {
    const onload =
      new URL(route.request().url()).searchParams.get('onload') ?? 'onloadTurnstileCallback';
    const token = JSON.stringify(CAPTCHA_BYPASS_TOKEN);
    const body = `
      window.turnstile = {
        render: function (_el, opts) {
          setTimeout(function () {
            if (opts && typeof opts.callback === 'function') opts.callback(${token});
          }, 0);
          return 'turnstile-stub-widget';
        },
        execute: function (_el, opts) {
          if (opts && typeof opts.callback === 'function') opts.callback(${token});
        },
        reset: function () {},
        remove: function () {},
        getResponse: function () { return ${token}; }
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
