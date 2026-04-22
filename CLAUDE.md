# Cosy Domain Provider — Systemtests

Playwright end-to-end tests for the `cosy-domain-provider-frontend` (React SPA at `localhost:5173`).

## Commands

```bash
npm test              # Run all tests headless (Chromium)
npm run test:headed   # Run with visible browser
npm run test:ui       # Interactive Playwright UI (watch mode)
npm run test:debug    # Step-through debugger
npm run report        # Open last HTML report
```

Set `BASE_URL` env var to test against a deployed environment instead of localhost.

## Project structure

```
tests/
  fixtures/index.ts      # Custom test + expect — always import from here
  helpers/index.ts       # Shared utilities (generateSubdomain, waitForApiIdle)
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
| `/dashboard` | `DashboardPage` |
| `/domain/:id` | `DomainDetailPage` |
