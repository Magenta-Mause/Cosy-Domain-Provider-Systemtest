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
| `npm test` | Run all tests headless |
| `npm run test:headed` | Run with visible browser window |
| `npm run test:ui` | Open Playwright UI mode (interactive, with watch) |
| `npm run test:debug` | Step through tests in debug mode |
| `npm run report` | Open the last HTML test report |

Run a single spec file:

```bash
npx playwright test tests/specs/counter.spec.ts
```

Run against a different environment:

```bash
BASE_URL=https://staging.example.com npm test
```

## Project Structure

```
tests/
├── fixtures/   # Custom test fixtures (extended test object)
├── helpers/    # Shared helper functions and test data utilities
├── pages/      # Page Object Models
└── specs/      # Test specs (one file per feature area)
```
