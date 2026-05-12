# Cosy Domain Provider — Systemtests

Playwright end-to-end tests for the `../Cosy-Domain-Provider-Frontend` (React SPA at `localhost:5173`).

## Commands

```bash
npm test                # Run all tests headless (Chromium)
npm run test:staging    # Run default staging suite with one worker
npm run test:staging:admin # Run Admin Portal smoke tests
npm run test:staging:mail # Run staging with opt-in mail-flow tests
npm run test:staging:mfa-ui # Run visible MFA setup/login UI test
npm run test:staging:stripe # Run Stripe Checkout subscription test
npm run test:headed     # Run with visible browser
npm run test:ui         # Interactive Playwright UI (watch mode)
npm run test:debug      # Step-through debugger
npm run report          # Open last HTML report
```

### Gegen Staging testen

`test:staging` setzt `BASE_URL` automatisch. Credentials kommen aus `.env.local`:

```bash
# .env.local (einmalig anlegen, wird nie committet)
STAGING_AUTH_USERNAME=deinuser
STAGING_AUTH_PASSWORD=deinpasswort
```

```bash
npm run test:staging
```

In CI die Credentials als Secrets setzen — `.env.local` wird ignoriert wenn die Vars bereits in der Umgebung gesetzt sind.

| Env var | Zweck | Default |
|---------|-------|---------|
| `BASE_URL` | Ziel-URL | `http://localhost:5173` |
| `STAGING_AUTH_USERNAME` | Staging-Barrier Benutzername | — (kein Staging-Auth) |
| `STAGING_AUTH_PASSWORD` | Staging-Barrier Passwort | — (kein Staging-Auth) |
| `MAIL_SERVICE_API_KEY` | Bearer-Token für die Mail-Testbox-API | — (Mail-Tests übersprungen) |
| `TEST_MAIL_DOMAIN` | Domain für generierte App-Testuser-Mails | `example.org` |
| `TEST_USER_SETUP_MAIL_TIMEOUT_MS` | Timeout für Setup-Verifizierungsmail | `45000` |
| `RUN_MAIL_FLOW_TESTS` | Zusätzliche Mail-Flow-Specs ausführen | — |
| `RUN_MFA_UI_TESTS` | Sichtbaren MFA-UI-Test ausführen | — |
| `HEADED_SETUP` | Global-Setup-Browser sichtbar starten | — |
| `SLOW_MO_MS` | Slow motion für Global-Setup-Browser | — |

## Project structure

```
tests/
  fixtures/index.ts      # Custom test + expect — always import from here
  helpers/index.ts       # Shared utilities (generateSubdomain, generateTestEmail, waitForApiIdle)
  helpers/mail-service.ts# MailService class — wartet auf Mails, extrahiert Tokens
  pages/                 # Page Object Models, grouped by feature area
  specs/                 # Test files
```

## Conventions

- **Always import `test` and `expect` from `@fixtures/index`**, never directly from `@playwright/test`.
- **All selectors go in page objects**, never inline in specs. Use `page.getByTestId(...)`.
- **`data-testid` attributes are owned by the frontend.** If one is missing, add it in `../Cosy-Domain-Provider-Frontend` first, then reference it here.
- **Test descriptions in German** — matches `locale: 'de-DE'` in the Playwright config.
- **Auth in tests:** use the `authenticatedPage` fixture for tests that require a logged-in user. The app test user is created in `global-setup` via API, verified through the test mailbox, secured with MFA, and stored in `.auth/test-user.json`; the authenticated browser state after password + MFA login is stored in `.auth/app-user-state.json`. `STAGING_AUTH_USERNAME` / `STAGING_AUTH_PASSWORD` are only for the Staging barrier, not for app login.
- **Mail-heavy specs:** the default staging run only sends the setup verification mail. Specs that exercise additional verification/reset mails require `RUN_MAIL_FLOW_TESTS=1` or `npm run test:staging:mail`.
- **MFA UI:** `npm run test:staging:mfa-ui -- --headed --timeout=120000` runs the browser-visible MFA setup and MFA challenge flow.
- **Cleanup:** users registered by setup/specs are recorded in `.auth/cleanup-users.json` and deleted in `globalTeardown`.
- **Page objects are grouped by feature area** under `tests/pages/{admin,auth,billing,domains,public}`.
- **Specs should import page objects from `@pages/index`** unless a test explicitly needs a local file import.

> **Hinweis:** Login und Register sind zweistufig (E-Mail → Passwort/Details).
> Das Register-Formular (Schritt 2) verwendet **Cloudflare Turnstile** — der Submit-Button bleibt in headless Playwright deaktiviert bis das CAPTCHA-Token vorliegt. End-to-End-Tests für den vollen Registrierungsflow benötigen entweder headed Mode oder einen Turnstile-Bypass.
