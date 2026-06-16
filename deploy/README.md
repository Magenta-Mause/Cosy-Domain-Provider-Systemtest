# In-Cluster-Monitoring (CronJob)

Statt der GitHub-Actions-Nightly laufen die Systemtests als **CronJob in deinem
Cluster** (von deinem Argo via GitOps verwaltet) und pushen die Ergebnisse als
Prometheus-Metriken an den Pushgateway → Grafana.

```
Dein Cluster (dein Argo)          Janne's Cluster
┌──────────────────────┐  push    ┌─────────────────────────┐
│ CronJob (Playwright) │────────► │ Pushgateway (+SvcMon)   │
│  nightly 02:00 UTC   │  HTTPS   │   ▼ scrape              │
└──────────────────────┘          │ Prometheus ──► Grafana  │
                                   └─────────────────────────┘
```

## Phase 1 — erst nur testen, ob die Suites im Cluster durchlaufen

Hier ist `PUSHGATEWAY_URL` im `cronjob.yaml` noch auskommentiert → der Job führt
die Suites aus, schreibt Ergebnis + Metriken ins Log und **pusht nichts** (Job
bleibt grün, kein Pushgateway/Grafana nötig).

1. **Image bauen lassen:** Push auf `main` triggert `.github/workflows/build-image.yml`
   → `ghcr.io/magenta-mause/cosy-domain-provider-systemtest:latest`.
   (Ist das Package privat, im Cluster ein `ghcr-pull-secret` anlegen und im
   `cronjob.yaml` einkommentieren.)

2. **Secret** für den CronJob anlegen (für Phase 1 reichen die ersten vier Werte):
   ```bash
   kubectl create namespace cosy-systemtest
   kubectl -n cosy-systemtest create secret generic cosy-systemtest-secrets \
     --from-literal=STAGING_AUTH_USERNAME=... \
     --from-literal=STAGING_AUTH_PASSWORD=... \
     --from-literal=MAIL_SERVICE_API_KEY=... \
     --from-literal=ADMIN_PORTAL_API_KEY=...
   ```

3. **Argo-App** anwenden (dein Cluster):
   ```bash
   kubectl apply -f deploy/argocd-application.yaml
   ```

4. **Sofort einen Lauf starten** (statt auf 02:00 zu warten) und Log ansehen:
   ```bash
   kubectl -n cosy-systemtest create job --from=cronjob/cosy-systemtest manual-run-1
   kubectl -n cosy-systemtest logs -f job/manual-run-1
   ```
   Erwartung: am Ende eine Zusammenfassung (`PASS/FAIL` pro Suite) + die Metriken,
   dann „Push übersprungen (Dry-Run)". Job-Status `Completed`.

## Phase 2 — Grafana anbinden

1. **Pushgateway** im Deployment-Repo deployen (Janne's Cluster):
   `kubectl apply -f argocd/pushgateway-app.yaml` + Basic-Auth-Secret anlegen
   (siehe `docs/secrets-required.md` dort).
2. **CronJob-Secret ergänzen** um `PUSHGATEWAY_USERNAME` / `PUSHGATEWAY_PASSWORD`
   (gleiche Werte wie im htpasswd).
3. **`PUSHGATEWAY_URL`** im `cronjob.yaml` einkommentieren (Host == Ingress-Host,
   Default `pushgateway.jannekeipert.de`) und pushen → Argo rollt aus.
4. **Grafana**: Panels + Alerts laut `../docs/grafana-systemtest.md` anlegen.

## Lokal ausprobieren

```bash
# PUSHGATEWAY_URL (+ ggf. PUSHGATEWAY_USERNAME/PASSWORD) in .env.local setzen
npm run monitor
```

## Danach: alte Nightly entfernen

Sobald der CronJob grün durchläuft und im Dashboard auftaucht, kann die
`schedule:`-Trigger in `.github/workflows/playwright.yml` raus (oder die Datei
ganz löschen) — sie wird dann nicht mehr gebraucht.
