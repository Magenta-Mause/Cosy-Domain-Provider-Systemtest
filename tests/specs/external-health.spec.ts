import { test, expect, runsOnlyAgainstStaging } from '../fixtures';
import { RegisterPage } from '@pages/index';
import { generateTestEmail } from '@helpers/index';

/**
 * Synthetisches Monitoring der EXTERNEN Integrationen, die sonst kein Test berührt:
 * OAuth-Provider (Google/GitHub/Discord) und Cloudflare Turnstile. Zweck: wenn eine
 * dieser externen Abhängigkeiten kaputtgeht (falsche Client-ID/Callback, toter
 * Auth-Endpoint, abgelaufener Turnstile-Sitekey, CF-Ausfall), schlägt der nightly
 * Lauf an — ohne dass wir aktiv etwas anfassen müssen.
 *
 * Kein echter Provider-Login (nicht automatisierbar) — wir prüfen nur, dass die
 * Integration korrekt *initiiert* (Redirect zum Provider) bzw. *lädt* (Turnstile).
 */

// Init-Endpoint des Backends (Frontend macht: location.href = /api/v1/auth/oauth/<p>/authorize).
const OAUTH_PROVIDERS = [
  { id: 'google', host: /google\.com/ },
  { id: 'github', host: /github\.com/ },
  { id: 'discord', host: /discord\.com/ },
];

test.describe('Externe Integrationen', () => {
  runsOnlyAgainstStaging(
    'Externe-Health-Checks (OAuth-Config, Turnstile-Sitekey) prüfen die Staging-Umgebung — lokal nicht aussagekräftig.',
  );

  for (const provider of OAUTH_PROVIDERS) {
    test(`OAuth-Init: ${provider.id} leitet zum Provider weiter`, async ({ page }) => {
      // page.request trägt das Staging-Barriere-Cookie (config use.storageState).
      // maxRedirects:0 -> wir sehen die erste Weiterleitung des Backends zum Provider,
      // ohne dem Provider-Login zu folgen.
      const res = await page.request.get(`/api/v1/auth/oauth/${provider.id}/authorize`, {
        maxRedirects: 0,
      });
      expect(
        [301, 302, 303, 307, 308],
        `OAuth-Init ${provider.id} sollte zum Provider weiterleiten (Status ${res.status()})`,
      ).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location, `Location-Header für ${provider.id}`).toMatch(provider.host);
    });
  }

  test('Turnstile-Widget lädt auf der Registrierung', async ({ page }) => {
    const register = new RegisterPage(page);
    // Auf den Turnstile-Script-Request warten — das Widget mountet in Schritt 2.
    // Schlägt der Sitekey fehl / ist CF down, kommt der Request nicht -> Timeout = Fehler.
    const turnstileRequest = page.waitForRequest(
      (req) => /challenges\.cloudflare\.com\/turnstile/.test(req.url()),
      { timeout: 30_000 },
    );
    await register.navigate();
    await register.fillEmail(generateTestEmail());
    await turnstileRequest;
  });
});
