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

- [x] **2.1 Docker-Image-Mismatch fixen:** kein Container mehr — `ubuntu-latest` + `npx playwright install --with-deps chromium`. Browser bleibt automatisch in sync mit `package.json`.
- [ ] **2.2 Secrets/Variablen in GitHub einrichten** (User-Aktion, dokumentiert in `docs/ci-grafana-setup.md`):
  - Secrets: `STAGING_AUTH_USERNAME`, `STAGING_AUTH_PASSWORD`, `MAIL_SERVICE_API_KEY`, `ADMIN_PORTAL_API_KEY`
  - Repo-Variable: `BASE_URL` = Staging-URL
- [x] **2.3 Workflow auf Staging umstellen:** `npm run test:staging`, Trigger nur noch `workflow_dispatch` + Nightly cron `0 23 * * *`. Push/PR-Trigger entfernt.
- [x] **2.4 Concurrency-Group gesetzt:** `playwright-staging`, `cancel-in-progress: false` — Runs queueen statt zu überlappen.
- [x] **2.5 Artifacts:** `playwright-report/` (always, 7 d), `test-results/` (nur bei Failure, 7 d).
- [ ] **2.6 Failure-Notification (optional):** Slack/Email bei rotem main.
- [ ] **2.7 Grafana-Dashboard:** Datasource + Panels laut `docs/ci-grafana-setup.md` einrichten (User-Aktion). Infinity-Plugin, GitHub-PAT, vier Panels (Letzter Run, Erfolgsrate, Tabelle, Tage seit Failure).
- [ ] **2.8 `docs/ci-grafana-setup.md` löschen**, sobald Grafana steht — die Datei ist nur eine Einmal-Anleitung, nicht zum dauerhaften Mitleben gedacht.

## Phase 3 — Coverage-Erweiterung

- [x] **3.1 Domain-CRUD-Spec:** `tests/specs/domain-crud.spec.ts` (Staging-only, lokales Backend hat kein Route53).
- [x] **3.2 Settings-Spec:** `tests/specs/settings.spec.ts` (Username + Passwort; MFA-Management entfällt, Feature existiert nicht in Settings-UI).
- [x] **3.3 Subscription-Management (Subscribe + Cancel):** `billing-stripe.spec.ts` als End-to-End-Test (Subscribe → Plus-Bestätigung → Customer-Portal → Cancel → Cancel-Bestätigung → Return). Läuft grün in ~27 s. Wichtige Lessons:
  - Stripe-Checkout-Felder via `getByRole('textbox', { name })` ansprechen, nicht `getByLabel` — Stripe nutzt aria-label statt `<label for>`.
  - "I am an AI agent" Checkbox ist visuell versteckt; Label-Klick + `setChecked(true, { force: true })` als Fallback.
  - Plus-Bestätigung pollt `plusPlanDescription` (eindeutiger Text "Thank you for supporting") und wartet zwischen Reloads explizit auf `currentPlanLabel`, damit der SPA-Bootstrap fertig ist — sonst hängt der Test bei "Loading…".
  - Customer Portal ist auf Deutsch: `link "Abonnement kündigen"` statt englischer Texte.
  - **Nach Cancel-Confirm öffnet Stripe einen Feedback-Survey-Modal** ("Aus welchem Grund haben Sie dieses Abonnement gekündigt?"), der `returnToAppLink` blockiert. Deshalb in `StripePortalPage` getrennt: `cancelSubscription()` macht nur Click+Confirm, `dismissFeedbackSurvey()` klickt "Nein danke". Dazwischen die Assertion auf `cancellationNotice` ("Abonnement wurde gekündigt").
  - Headed-Run mit Videos: `RECORD_VIDEO=1 HEADED_SETUP=1 SLOW_MO_MS=300 npm run test:staging:stripe -- --headed` (Config liest `RECORD_VIDEO` und schaltet `video: 'on'`).
- [x] **3.4 Static-Pages-Smoke:** `tests/specs/static-pages.spec.ts` (Impressum, Datenschutz, AGB).
- [~] **3.5 MFA-Recovery:** Feature existiert im Frontend nicht (`src/pages/mfa-*` hat nur Setup + Challenge, keinen Recovery-Code-Flow). Streichen oder erst Feature im Frontend bauen.
- [x] **3.6 Frontend-data-testids:** `settings-username-success` + `settings-password-success` im Frontend ergänzt (`cecbe9c`).

## Phase 4 — Allgemeine Pflege

- [ ] **4.1 Stale-Artefakte-Säubern:** `test-results/` Verzeichnisse aufräumen.
- [ ] **4.2 README/CLAUDE.md aktualisieren** für neue ENV-Vars (`TEST_USER_EMAIL_PREFIX`, `TEST_MAIL_DOMAIN_ALLOWLIST`, `ADMIN_PORTAL_API_KEY` als notwendig für Cleanup) und Script `cleanup:staging`.
- [ ] **4.3 Browser-Matrix erwägen** (Firefox/WebKit Re-Aktivierung) nach CI-Grün.
- [ ] **4.4 Mail-Service-Timing-Flake (aufgedeckt während Phase 1-Verifikation):** Setup-Verify-Mail kam nicht innerhalb der 45 s `TEST_USER_SETUP_MAIL_TIMEOUT_MS`. Optionen: Default-Timeout auf 90 s erhöhen, Mail-Service-Verfügbarkeit prüfen, oder Setup mit Retry umhüllen. Nicht durch Phase 1 verursacht.
- [ ] **4.5 Workers > 1 prüfen:** Alle `test:staging*`-Scripts laufen mit `--workers=1`, weil Setup-/Cleanup-Logik bisher seriell gedacht ist und der gemeinsame App-Test-User in `.auth/` nur einmal existiert. Mit allen Opt-in-Suiten im Nightly läuft die Pipeline jetzt aber spürbar länger — lohnt sich Parallelisierung? Knackpunkte: pro Worker einen eigenen App-User registrieren, Stripe-Subscription-State pro Test isolieren, Admin-Cleanup race-condition-frei halten. Erst messen wie lang der Nightly wirklich braucht, dann entscheiden.

---

## Notizen

- Arbeitsmodus: direkt auf `main` (laut Absprache, abweichend vom älteren PR-Workflow-Memo).
- TODO wird zusammen gepflegt — erledigte Items rausstreichen, zwischendurch `/clear` für frischen Chat-Context.
