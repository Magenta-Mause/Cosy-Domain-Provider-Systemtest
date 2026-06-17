# In-Cluster-Monitoring (CronJob)

Statt der GitHub-Actions-Nightly laufen die Systemtests als **CronJob in einem
Kubernetes-Cluster** und pushen die Ergebnisse als Prometheus-Metriken an einen
Pushgateway → Grafana.

```
Test-Cluster (Argo/GitOps)        Janne's Cluster
┌──────────────────────┐  push    ┌─────────────────────────┐
│ CronJob (Playwright) │────────► │ Pushgateway (+SvcMon)   │
│  nightly 02:00 UTC   │  HTTPS   │   ▼ scrape              │
└──────────────────────┘          │ Prometheus ──► Grafana  │
                                   └─────────────────────────┘
```

## Was liegt wo

Dieser `deploy/`-Ordner enthält nur die **generische Workload** — keine
Geheimnisse, keine clusterspezifischen Dinge:

- `cronjob.yaml` — der CronJob (Image `ghcr.io/magenta-mause/cosy-domain-provider-systemtest:latest`, public).
- `kustomization.yaml` — Kustomize-Set, Namespace `cosy-systemtest`.
- `secret.example.yaml` — **Vorlage** (Platzhalter), zeigt welche Keys das
  Secret `cosy-systemtest-secrets` braucht. Bewusst NICHT in `kustomization.yaml`.

**Registrierung + Secrets sind clusterspezifisch** und liegen daher im jeweiligen
GitOps-Repo des Clusters, nicht hier. Für Simons Cluster z.B. in `homelab-gitops`:
eine Argo-`Application` (Multi-Source: dieser `deploy/`-Ordner + der lokale
SealedSecret) und eine kubeseal-verschlüsselte `cosy-systemtest-secrets`.

## In ein Cluster bringen

1. **Secret bereitstellen** im Namespace `cosy-systemtest` mit den Keys aus
   `secret.example.yaml` (für Phase 1 reichen die ersten vier). GitOps-sauber als
   SealedSecret, z.B.:
   ```bash
   kubectl create secret generic cosy-systemtest-secrets -n cosy-systemtest \
     --from-env-file=.env.local --dry-run=client -o yaml \
   | kubeseal --controller-namespace sealed-secrets --controller-name sealed-secrets \
              --format yaml > <gitops-repo>/cosy-systemtest/sealed-secret.yaml
   ```
2. **Argo-Application** anlegen, die `deploy/` dieses Repos synct (+ den
   SealedSecret aus dem GitOps-Repo). Beispiel siehe
   `homelab-gitops/apps/cosy-systemtest.yaml`.

## Phase 1 — erst nur testen, ob die Suites im Cluster durchlaufen

`PUSHGATEWAY_URL` ist im `cronjob.yaml` noch auskommentiert → der Job führt die
Suites aus, schreibt Ergebnis + Metriken ins Log und **pusht nichts** (Job bleibt
grün, kein Pushgateway/Grafana nötig).

Sofort einen Lauf starten (statt auf 02:00 zu warten) und Log ansehen:
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
2. **Secret ergänzen** um `PUSHGATEWAY_USERNAME` / `PUSHGATEWAY_PASSWORD`
   (gleiche Werte wie im htpasswd) und neu versiegeln.
3. **`PUSHGATEWAY_URL`** im `cronjob.yaml` einkommentieren (Host == Ingress-Host,
   Default `pushgateway.jannekeipert.de`) und pushen → Argo rollt aus.
4. **Grafana**: Panels + Alerts laut `../docs/grafana-systemtest.md` anlegen.

## Lokal ausprobieren

```bash
# PUSHGATEWAY_URL (+ ggf. PUSHGATEWAY_USERNAME/PASSWORD) in .env.local setzen
npm run monitor
```

## Danach: alte Nightly entfernen

Sobald der CronJob grün durchläuft und im Dashboard auftaucht, kann der
`schedule:`-Trigger in `.github/workflows/playwright.yml` raus (oder die Datei
ganz löschen) — sie wird dann nicht mehr gebraucht.
