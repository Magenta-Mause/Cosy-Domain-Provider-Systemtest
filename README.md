# Cosy-Domain-Provider-Systemtest

Playwright-based system tests for the Cosy Domain Provider frontend.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- The frontend running at `http://localhost:5173` (or set `BASE_URL` env var to point elsewhere)

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers (only needed once, or after updating Playwright)
npx playwright install --with-deps chromium
```

## Running Tests

| Command | Description |
|---|---|
| `npm test` | Run all tests headless (localhost) |
| `npm run test:staging` | Run all tests against the staging environment |
| `npm run test:headed` | Run with visible browser window |
| `npm run test:ui` | Open Playwright UI mode (interactive, with watch) |
| `npm run test:debug` | Step through tests in debug mode |
| `npm run report` | Open the last HTML test report |

Run a single spec file:

```bash
npx playwright test tests/specs/smoke.spec.ts
```

### Staging

`test:staging` sets `BASE_URL` automatically. Credentials are loaded from `.env.local`:

```bash
# .env.local  (gitignored — create once, never commit)
STAGING_AUTH_USERNAME=youruser
STAGING_AUTH_PASSWORD=yourpassword
```

```bash
npm run test:staging
```

In CI, set `STAGING_AUTH_USERNAME` and `STAGING_AUTH_PASSWORD` as repository secrets and pass them as environment variables — `.env.local` is skipped when the variables are already present in the environment.

## Project Structure

```
tests/
├── fixtures/   # Custom test fixtures (extended test object)
├── helpers/    # Shared helper functions and test data utilities
├── pages/      # Page Object Models
└── specs/      # Test specs (one file per feature area)
```
