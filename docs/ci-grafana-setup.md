# CI- und Grafana-Setup

Schritte, die **außerhalb** dieses Repos erledigt werden müssen, damit der Workflow `.github/workflows/playwright.yml` läuft und Grafana den Run-Status anzeigt.

## A. GitHub Repo-Settings → Secrets and variables → Actions

### Repository-Variable

| Name | Wert |
|------|------|
| `BASE_URL` | `https://staging.domain-provider.cosy-hosting.net` |

### Repository-Secrets

| Name | Quelle |
|------|--------|
| `STAGING_AUTH_USERNAME` | Staging-Basic-Auth-User (Wert aus lokaler `.env.local`) |
| `STAGING_AUTH_PASSWORD` | Staging-Basic-Auth-Passwort |
| `MAIL_SERVICE_API_KEY` | Bearer-Token Testpostfach-API |
| `ADMIN_PORTAL_API_KEY` | Admin-Portal-API-Key (für Cleanup-Scan) |

Pfad: `Settings → Secrets and variables → Actions → New repository secret/variable`.

### Workflow manuell starten

`Actions → Playwright Tests (Staging) → Run workflow`. Nightly läuft automatisch um **23:00 UTC ≈ 01:00 Berlin**.

---

## B. Grafana — GitHub-API als Datasource (Pull)

Empfehlung: **Infinity-Plugin** (`yesoreyeram-infinity-datasource`). Universal, ohne GitHub-spezifisches Plugin.

### Plugin + Datasource

1. `Administration → Plugins → "Infinity" → Install`.
2. `Connections → Add new connection → Infinity`. Name z. B. `github-cosy-systemtest`.
3. Authentication → `Bearer Token`. Wert: **Fine-grained Personal Access Token** mit
   - Repository-Access: `Magenta-Mause/Cosy-Domain-Provider-Systemtest`
   - Permissions: `Actions: Read-only`, `Metadata: Read-only`
4. `Security → Allowed hosts`: `https://api.github.com` ergänzen.
5. Save & Test → grün.

---

## C. Dashboard

### Basis-Query

- **Type:** JSON
- **URL:** `https://api.github.com/repos/Magenta-Mause/Cosy-Domain-Provider-Systemtest/actions/workflows/playwright.yml/runs?per_page=30`
- **Root selector:** `workflow_runs`

### Felder (Columns)

| Selector | Type | Verwendung |
|----------|------|------------|
| `id` | number | Eindeutigkeit |
| `name` | string | Workflow-Name |
| `conclusion` | string | `success` / `failure` / `cancelled` / leer wenn in-progress |
| `status` | string | `completed` / `in_progress` / `queued` |
| `run_started_at` | timestamp | Startzeit |
| `updated_at` | timestamp | Endzeit (≈) — Dauer = updated_at − run_started_at |
| `event` | string | `workflow_dispatch` vs. `schedule` |
| `html_url` | string | Drill-down-Link zur Run-Seite |

### Panel-Vorschläge

1. **Stat „Letzter Run"**
   - Query: erste Zeile, Feld `conclusion`.
   - Value-Mappings: `success → grün ✓`, `failure → rot ✗`, leer → grau „läuft".
2. **Time-Series „Erfolgsrate (7 Tage)"**
   - Transformation: `conclusion == success ? 1 : 0`, gruppiert pro Tag, Aggregat `mean`.
3. **Tabelle „Letzte 10 Runs"**
   - Spalten: `run_started_at`, `event`, Dauer (Calc-Field `updated_at − run_started_at` in min), `conclusion`, `html_url` (als Data Link).
4. **Stat „Tage seit letztem Failure"**
   - Query-Filter: `conclusion == failure`, Aggregat `max(run_started_at)`, im Display `now() − value` in Tagen.

Refresh-Intervall: **5 min** ist ausreichend (PAT-Rate-Limit 5000 req/h).

---

## D. Verifikation

1. Secrets/Variables gesetzt → Workflow manuell triggern → grüner Run.
2. Artifact `playwright-report` herunterladen, `index.html` öffnen.
3. Grafana-Dashboard reloaded → letzter Run erscheint mit korrekter `conclusion`.
4. Failure-Pfad: einen Test absichtlich brechen, Workflow erneut starten → Artifact `test-results` enthält Traces + Videos.

---

## E. Erweiterungen (später)

- **Failure-Notifications:** Slack-Webhook-Step bei `if: failure()` im Workflow (TODO 2.6).
- **Per-Test-Trend:** `playwright-ctrf-json-reporter` einbinden, CTRF-JSON nach InfluxDB pushen, Grafana mit InfluxDB-Datasource. Erst sinnvoll, wenn Flake-Tracking gewünscht.
- **Privates Hosting der HTML-Reports:** S3/MinIO/R2 mit signierten URLs, Link aus Grafana-Tabelle.
- **Suite-Auswahl per Dispatch-Input:** `workflow_dispatch.inputs.suite` mit Dropdown `default | mail | mfa-ui | stripe | admin` → mappt auf `npm run test:staging[:variant]`.
