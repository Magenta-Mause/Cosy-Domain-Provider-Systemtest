# Cosy Domain Provider — Systemtests

Playwright end-to-end tests for the `cosy-domain-provider-frontend` (React SPA at `localhost:5173`).

## Commands

```bash
npm test                # Run all tests headless (Chromium)
npm run test:staging    # Run against staging environment
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
| `TEST_USERNAME` | App-Login Benutzername | `testuser` |
| `TEST_PASSWORD` | App-Login Passwort | `testpass` |
| `STAGING_AUTH_USERNAME` | Staging-Barrier Benutzername | — (kein Staging-Auth) |
| `STAGING_AUTH_PASSWORD` | Staging-Barrier Passwort | — (kein Staging-Auth) |
| `MAIL_SERVICE_API_KEY` | Bearer-Token für die Mail-Testbox-API | — (Mail-Tests übersprungen) |

## Project structure

```
docs/
  mail-service.md        # Mail Service API reference (ohne Secrets)
tests/
  fixtures/index.ts      # Custom test + expect — always import from here
  helpers/index.ts       # Shared utilities (generateSubdomain, generateTestEmail, waitForApiIdle)
  helpers/mail-service.ts# MailService class — wartet auf Mails, extrahiert Tokens
  pages/                 # Page Object Models, one file per route
  specs/                 # Test files
```

## Conventions

- **Always import `test` and `expect` from `@fixtures/index`**, never directly from `@playwright/test`.
- **All selectors go in page objects**, never inline in specs. Use `page.getByTestId(...)`.
- **`data-testid` attributes are owned by the frontend.** If one is missing, add it in `cosy-domain-provider-frontend` first, then reference it here.
- **Test descriptions in German** — matches `locale: 'de-DE'` in the Playwright config.
- **Auth in tests:** use the `authenticatedPage` fixture for tests that require a logged-in user. Set credentials via `TEST_USERNAME` / `TEST_PASSWORD` env vars (defaults: `testuser` / `testpass`).
- **One page object per route:**

| Route | Page Object |
|-------|-------------|
| `/` | `HomePage` |
| `/login` | `LoginPage` |
| `/register` | `RegisterPage` |
| `/verify` | `VerifyPage` |
| `/dashboard` | `DashboardPage` |
| `/domain/:id` | `DomainDetailPage` |
