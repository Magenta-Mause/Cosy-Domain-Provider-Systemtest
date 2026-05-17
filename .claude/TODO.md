# Cosy Domain Provider — Systemtest TODO

Gemeinsame Tracking-Liste. Erledigte Punkte werden gestrichen oder gelöscht.
Reihenfolge: **Cleanup-Härtung → CI/CD-Fix → Coverage-Erweiterung**.

---

## Kontext / Befundlage (Stand 2026-05-15)

- **Setup/Teardown sind happy-path-robust**, aber:
  - `tests/global-teardown.ts`: wenn `DELETE /api/v1/user` einen anderen Fehler als 404 wirft (z.B. 5xx, Netzwerk), bleibt der Eintrag in `.auth/cleanup-users.json` stehen — beim nächsten Run wird derselbe User erneut versucht, aber nicht garantiert gelöscht. Geisteruser auf Staging möglich.
  - Kein **Pre-Run-Cleanup** von Karteileichen aus früheren Runs.
  - Kein **Admin-API-Scan** auf `playwright-*` User die durch Crashes nie in `cleanup-users.json` landeten.
- **CI/CD ist 100% rot.** GitHub Actions Workflow `.github/workflows/playwright.yml` nutzt Docker-Image `mcr.microsoft.com/playwright:v1.52.0-noble`, `package.json` hat aber `@playwright/test ^1.59.1` → "Executable doesn't exist". Zusätzlich: keine Secrets gesetzt, `BASE_URL` fällt auf `localhost:5173` zurück, App läuft im Workflow nicht.
- **Coverage-Lücken**: `/settings` (Profil, Passwort, MFA-Management), Domain-CRUD-Flows (Page Objects existieren, aber keine Spec), Subscription-Management nach Stripe-Checkout, Static Pages, MFA-Recovery-Code-Flow.

Admin-API ist nutzbar: `GET /api/v1/admin/users`, `DELETE /api/v1/admin/users/{uuid}` (Auth via `ADMIN_PORTAL_API_KEY`, bereits in `.env.local` vorhanden).

---

## Phase 1 — Cleanup-Härtung (zuerst)

- [x] **1.1 Teardown-Bug fixen:** `tests/global-teardown.ts` neu geschrieben — nutzt `processCleanupQueue`, dann Admin-Orphan-Scan. Permanente Fehler wandern in `cleanup-failures.json`, Einträge aus `cleanup-users.json` werden entfernt (auch bei 404). Retries 3× mit exponentiellem Backoff.
- [x] **1.2 Admin-Cleanup-Helper:** `tests/helpers/admin-cleanup.ts` — `listAdminUsers`, `findAdminUserByEmail`, `deleteUserAsAdmin`, `deleteOrphanPlaywrightUsers`. Sicherheitsbremse über `isPlaywrightTestEmail` (Prefix `playwright-` + Allowlist-Domain via `TEST_MAIL_DOMAIN_ALLOWLIST`).
- [x] **1.3 Pre-Run-Cleanup in `tests/global-setup.ts`** — Funktion `preRunCleanup(baseURL)`: verarbeitet erst die Cleanup-Queue (alte Karteileichen), dann Admin-Scan auf `playwright-*` User. `resetCleanupUsers()` wurde **entfernt** (Bug: hat Karteileichen aus früheren Runs vor dem Cleanup weggewischt).
- [x] **1.4 Defensive Cleanup:** `recordCleanupUser` läuft bereits **vor** der Registrierung (global-setup.ts:104), synchron auf Disk → bei Setup-Crash bleibt der Eintrag erhalten und wird beim nächsten Run aufgeräumt. Kein zusätzlicher Fix nötig.
- [x] **1.5 Standalone-Cleanup-Script:** `scripts/cleanup-staging.ts` + `npm run cleanup:staging`. Nutzt `tsx` (neu als devDep).
- [x] **1.6 Verifikation:**
  - [x] Staging: `npm run cleanup:staging` → gelöscht=1 (Queue) + gelöscht=1 (Admin-Scan, Orphan ohne Eintrag in cleanup-users.json). Beweist: Admin-Scan fängt User die durchgerutscht sind.
  - [x] Staging: `npm run test:staging` lief mit echtem Setup-Crash (Mail-Timeout) → User wurde trotzdem registriert und im Teardown gelöscht. `.auth/cleanup-users.json` & `.auth/cleanup-failures.json` danach **leer**.
  - [ ] Lokal `npm test` ungetestet (App muss auf localhost:5173 laufen — separater Schritt).

## Phase 2 — CI/CD Pipeline reparieren

- [ ] **2.1 Docker-Image-Mismatch fixen:** `.github/workflows/playwright.yml`
  - Image auf `mcr.microsoft.com/playwright:v1.59.1-noble` heben (oder ohne Container laufen + `npx playwright install --with-deps chromium`). Pin an Playwright-Version aus `package.json`.
- [ ] **2.2 Secrets in GitHub einrichten** (User-Aktion, hier dokumentieren):
  - `STAGING_AUTH_USERNAME`, `STAGING_AUTH_PASSWORD`
  - `MAIL_SERVICE_API_KEY`
  - `ADMIN_PORTAL_API_KEY`
  - `BASE_URL` als Repo-Variable (Staging-URL)
- [ ] **2.3 Workflow auf Staging umstellen:** `npm run test:staging` statt `npx playwright test`, weil ohne laufende lokale App `BASE_URL=localhost:5173` nutzlos ist. Mail/MFA/Stripe-Flag-Specs bleiben opt-in.
- [ ] **2.4 Concurrency-Group setzen:** verhindert parallele Runs gegen Staging die sich Cleanup-Konflikte einhandeln.
- [ ] **2.5 Artifacts:** prüfen dass `playwright-report/`, `test-results/` (Traces, Videos, Screenshots) bei Failure hochgeladen werden.
- [ ] **2.6 Failure-Notification (optional):** Slack/Email bei rotem main.

## Phase 3 — Coverage-Erweiterung

- [x] **3.1 Domain-CRUD-Spec:** `tests/specs/domain-crud.spec.ts` (Staging-only, lokales Backend hat kein Route53).
- [x] **3.2 Settings-Spec:** `tests/specs/settings.spec.ts` (Username + Passwort; MFA-Management entfällt, Feature existiert nicht in Settings-UI).
- [ ] **3.3 Subscription-Management:** Cancel-Flow im Stripe Customer Portal. Aufwand offen — Portal-UI braucht einen Hands-on-Durchlauf, damit Labels/Selectors stimmen. `RUN_STRIPE_TESTS=1` opt-in.
- [x] **3.4 Static-Pages-Smoke:** `tests/specs/static-pages.spec.ts` (Impressum, Datenschutz, AGB).
- [~] **3.5 MFA-Recovery:** Feature existiert im Frontend nicht (`src/pages/mfa-*` hat nur Setup + Challenge, keinen Recovery-Code-Flow). Streichen oder erst Feature im Frontend bauen.
- [x] **3.6 Frontend-data-testids:** `settings-username-success` + `settings-password-success` im Frontend ergänzt (`cecbe9c`).

## Phase 4 — Allgemeine Pflege

- [ ] **4.1 Stale-Artefakte-Säubern:** `test-results/` Verzeichnisse aufräumen.
- [ ] **4.2 README/CLAUDE.md aktualisieren** für neue ENV-Vars (`TEST_USER_EMAIL_PREFIX`, `TEST_MAIL_DOMAIN_ALLOWLIST`, `ADMIN_PORTAL_API_KEY` als notwendig für Cleanup) und Script `cleanup:staging`.
- [ ] **4.3 Browser-Matrix erwägen** (Firefox/WebKit Re-Aktivierung) nach CI-Grün.
- [ ] **4.4 Mail-Service-Timing-Flake (aufgedeckt während Phase 1-Verifikation):** Setup-Verify-Mail kam nicht innerhalb der 45 s `TEST_USER_SETUP_MAIL_TIMEOUT_MS`. Optionen: Default-Timeout auf 90 s erhöhen, Mail-Service-Verfügbarkeit prüfen, oder Setup mit Retry umhüllen. Nicht durch Phase 1 verursacht.

---

## Notizen

- Arbeitsmodus: direkt auf `main` (laut Absprache, abweichend vom älteren PR-Workflow-Memo).
- TODO wird zusammen gepflegt — erledigte Items rausstreichen, zwischendurch `/clear` für frischen Chat-Context.
