# Systemtests in Grafana

Der In-Cluster-CronJob (`deploy/cronjob.yaml`) führt nächtlich alle Suites aus und
pusht die Ergebnisse an den Pushgateway (`base/pushgateway` im Deployment-Repo).
Prometheus scraped den Pushgateway, hier kommen die Panels + Alerts.

> Kein Grafana-Service-Account-Token vorhanden → alles **manuell** im bestehenden
> `cosy-domain-provider`-Dashboard anlegen. Unten die fertigen Queries; ganz unten
> ein importierbares Standalone-Dashboard als Alternative.

## Gepushte Metriken

| Metrik | Labels | Bedeutung |
|---|---|---|
| `cosy_systemtest_suite_success` | `suite` | 1 = letzte Suite grün, 0 = rot |
| `cosy_systemtest_suite_tests_passed` | `suite` | bestandene Tests |
| `cosy_systemtest_suite_tests_failed` | `suite` | fehlgeschlagene Tests |
| `cosy_systemtest_suite_tests_skipped` | `suite` | übersprungene Tests |
| `cosy_systemtest_suite_tests_flaky` | `suite` | flaky Tests |
| `cosy_systemtest_suite_duration_seconds` | `suite` | Laufzeit der Suite |
| `cosy_systemtest_run_success` | – | 1 = alle Suites grün |
| `cosy_systemtest_last_run_timestamp_seconds` | – | Unix-Zeit des letzten Laufs |

`suite` ∈ `default, mail, mfa-ui, stripe, admin`.

## Panels (neue Row "Systemtests" ins bestehende Dashboard)

**1) Suite-Status** — Typ *Stat*, eine Kachel pro Suite
```promql
cosy_systemtest_suite_success
```
Value mappings: `0 → FAIL` (rot), `1 → OK` (grün). Calculation: *Last*. Legend/Title: `{{suite}}`.

**2) Letzter erfolgreicher Lauf** — Typ *Stat*
```promql
time() - cosy_systemtest_last_run_timestamp_seconds
```
Unit: *seconds (s)*. Thresholds: grün `0`, rot `93600` (26 h). Zeigt das „Alter" des letzten Laufs.

**3) Test-Ergebnisse pro Suite** — Typ *Bar gauge* oder *Table*
```promql
cosy_systemtest_suite_tests_passed
cosy_systemtest_suite_tests_failed
cosy_systemtest_suite_tests_skipped
```
Legend je Query: `passed {{suite}}` / `failed {{suite}}` / `skipped {{suite}}`.

**4) Laufzeit pro Suite** — Typ *Time series*
```promql
cosy_systemtest_suite_duration_seconds
```
Unit: *seconds (s)*. Legend: `{{suite}}`.

## Alerts (Grafana Unified Alerting)

**A) Eine Suite ist rot**
- Query A: `cosy_systemtest_suite_success`
- Condition: `WHEN last() OF A IS BELOW 1` (→ feuert für jede Suite mit Wert 0)
- For: `5m` · Labels: `severity=critical` · Summary: `Systemtest-Suite {{ $labels.suite }} ist rot`

**B) Systemtests sind nicht gelaufen (stale / CronJob tot)**
- Query A: `time() - cosy_systemtest_last_run_timestamp_seconds`
- Condition: `WHEN last() OF A IS ABOVE 93600` (26 h)
- Zusätzliche „No-Data"-Regel: bei *No Data* ebenfalls alarmieren (Pushgateway/Metrik weg)
- For: `1h` · Labels: `severity=warning` · Summary: `Systemtests seit >26h nicht gelaufen`

> Tipp: Schedule ist täglich 02:00 UTC → 26 h Fenster toleriert einen einzelnen
> ausgefallenen Lauf, schlägt aber bei zwei Tagen Stille an.

## Alternative: komplettes Dashboard importieren

Falls du lieber importierst statt Panels einzeln baust — Grafana → Dashboards →
New → Import → JSON: `docs/grafana-systemtest-dashboard.json`. Beim Import die
Prometheus-Datasource auswählen.

## Alerts als Grafana-MCP-Prompt

Sobald ein Grafana-MCP-Server (mit Service-Account-Token) verfügbar ist, können
die zwei Alert-Regeln per Prompt angelegt werden. Prompt zum Einfügen:

> Lege in Grafana (Unified Alerting) zwei Alert-Regeln an. Datasource = die
> Prometheus-Instanz, die den Pushgateway scraped (`cosy_systemtest_*`-Metriken,
> Label `job="cosy-systemtest"`). Beide in einen Ordner „Cosy" / Evaluation-Group
> „systemtests", und an den bestehenden Default-Contact-Point hängen.
>
> **Regel 1 — „Systemtest-Suite rot"**
> - Query A (instant): `cosy_systemtest_suite_success{job="cosy-systemtest"}`
> - Expression B: Reduce, Function `last`, Input A
> - Expression C: Threshold, Input B, `IS BELOW 1` — als Alert-Condition
> - Evaluate every `1m`, pending period `for: 5m`
> - Labels: `severity=critical`
> - Summary: `Systemtest-Suite {{ $labels.suite }} ist rot`
> - Description: `Die nightly E2E-Suite {{ $labels.suite }} (Cosy Domain Provider) ist beim letzten Lauf fehlgeschlagen. Logs: kubectl -n cosy-systemtest logs job/<letzter Job>.`
> - Hinweis: Query liefert eine Serie pro `suite` → die Regel feuert automatisch
>   multi-dimensional (eine Instanz je betroffener Suite).
>
> **Regel 2 — „Systemtests nicht gelaufen / stale"**
> - Query A (instant): `time() - cosy_systemtest_last_run_timestamp_seconds{job="cosy-systemtest"}`
> - Expression B: Reduce `last` von A; Expression C: Threshold `IS ABOVE 93600` (26 h) — Alert-Condition
> - Evaluate every `5m`, `for: 1h`
> - „Alert state if no data" = `Alerting` (feuert auch, wenn die Metrik ganz verschwindet — Pushgateway/CronJob tot)
> - Labels: `severity=warning`
> - Summary: `Systemtests seit >26h nicht gelaufen — CronJob (Simon-Cluster) oder Pushgateway prüfen.`
> - Hinweis: Schedule ist täglich 02:00 UTC; 26 h toleriert einen einzelnen
>   ausgefallenen Lauf, schlägt aber bei zwei Tagen Stille an.
