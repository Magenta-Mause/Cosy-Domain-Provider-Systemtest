# Cosy-Domain-Provider-Systemtest

Playwright-based system tests for the Cosy Domain Provider frontend.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Backend](https://github.com/Magenta-Mause/Cosy-Domain-Provider-Backend) running at `http://localhost:8080`
- [Frontend](https://github.com/Magenta-Mause/Cosy-Domain-Provider-Frontend) running at `http://localhost:5173` (or set `BASE_URL` env var to point elsewhere)

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
| `npm run test:staging` | Run the default staging suite with one worker |
| `npm run test:staging:admin` | Run the Admin Portal smoke tests |
| `npm run test:staging:mail` | Run staging with opt-in mail-flow tests enabled |
| `npm run test:staging:mfa-ui` | Run the visible MFA setup/login UI test |
| `npm run test:staging:stripe` | Run the Stripe Checkout subscription test |
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
MAIL_SERVICE_API_KEY=mailbox-api-token
```

```bash
npm run test:staging
```

In CI, set `STAGING_AUTH_USERNAME`, `STAGING_AUTH_PASSWORD`, and `MAIL_SERVICE_API_KEY` as repository secrets and pass them as environment variables — `.env.local` is skipped when the variables are already present in the environment.

The Staging credentials are only used for the Staging barrier. The app test user is created during Playwright global setup via `/api/v1/auth/register`, verified through the test mailbox, secured with MFA, and written to `.auth/test-user.json` for fixtures that require an authenticated app user. The authenticated browser state after password + MFA login is stored in `.auth/app-user-state.json`.

`npm run test:staging` runs the full suite (including mail flows and the Stripe sandbox subscription, ~5–10 min). Use `npm run test:staging:core` for a fast check without extra mails/Stripe, or the scoped `test:staging:{mail,mfa-ui,stripe,admin,external}` scripts.
At the end of a suite, registered test users are deleted through `globalTeardown`.

To watch the global setup verification browser:

```bash
HEADED_SETUP=1 SLOW_MO_MS=500 npm run test:staging -- tests/specs/authenticated-setup.spec.ts --headed
```

To watch the MFA setup and MFA login challenge in the browser:

```bash
npm run test:staging:mfa-ui -- --headed --timeout=120000
```

## Project Structure

```
tests/
├── fixtures/   # Custom test fixtures (extended test object) + skip guards
├── helpers/    # Shared helpers: auth-api flows, mail service, captcha bypass, constants
├── pages/      # Page Object Models grouped by feature area
└── specs/      # Test specs (one file per feature area)
```

Page objects are grouped under `tests/pages/{admin,auth,billing,domains,public}` and re-exported through `@pages/index`.

**Architecture docs:** [docs/test-architecture.md](docs/test-architecture.md) — test-user lifecycle,
`.auth/` state files, env-flag matrix, captcha bypass, and the Given/When/Then spec conventions.

Key conventions (details in `CLAUDE.md` / `docs/test-architecture.md`):

- Auth/user API flows (register, verify, MFA, login) live in `tests/helpers/auth-api.ts` — never inline in specs.
- `BASE_URL` is resolved only via `resolveBaseURL()` from `tests/helpers/constants.ts`; requests use relative paths.
- Flow tests are structured with `test.step('Given: …' / 'When: …' / 'Then: …')`.
- Environment skips use the guards from `@fixtures/index` (`runsOnlyWithEnv`, `runsOnlyAgainstStaging`).

---

## Related repositories

| Repository | Description |
|---|---|
| [Cosy-Domain-Provider-Backend](https://github.com/Magenta-Mause/Cosy-Domain-Provider-Backend) | Spring Boot backend |
| [Cosy-Domain-Provider-Frontend](https://github.com/Magenta-Mause/Cosy-Domain-Provider-Frontend) | React + Vite frontend |
