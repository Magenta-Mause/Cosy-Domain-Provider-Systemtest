/**
 * Monitoring-Runner für den In-Cluster-CronJob.
 *
 * Führt alle Staging-Suites nacheinander aus (jede mit ihrem eigenen global-setup),
 * liest pro Suite den Playwright-JSON-Report aus und pusht die aggregierten
 * Kennzahlen als Prometheus-Metriken an einen Pushgateway. Prometheus scraped den
 * Pushgateway, Grafana visualisiert + alarmiert.
 *
 * Quelle der Wahrheit für "Suite rot/grün" ist die Metrik — der Prozess endet
 * deshalb mit Exit 0, solange der Push klappt (auch wenn Tests rot sind). Nur ein
 * fehlgeschlagener Push (Infrastruktur) führt zu Exit 1, damit der k8s-Job dann
 * sichtbar fehlschlägt.
 *
 * Env:
 *   PUSHGATEWAY_URL            z.B. https://pushgateway.jannekeipert.de  (Pflicht)
 *   PUSHGATEWAY_USERNAME/_PASSWORD  optionale Basic-Auth für den Push
 *   BASE_URL, STAGING_AUTH_*, MAIL_SERVICE_API_KEY, ADMIN_PORTAL_API_KEY  (wie sonst)
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type SuiteDef = { name: string; script: string };

// Jede Suite läuft genau die Specs, die zu ihr gehören — keine Überlappung, daher
// keine "phantom skips" mehr im Dashboard (die `skipped`-Metrik zeigt jetzt nur
// noch echte Skips). `default` = immer-laufende Core-Specs; die opt-in Specs laufen
// ausschließlich in ihrer jeweiligen Suite.
const SUITES: SuiteDef[] = [
  { name: 'default', script: 'test:staging:core' },
  { name: 'mail', script: 'test:staging:mail' },
  { name: 'mfa-ui', script: 'test:staging:mfa-ui' },
  { name: 'stripe', script: 'test:staging:stripe' },
  { name: 'admin', script: 'test:staging:admin' },
  { name: 'external', script: 'test:staging:external' },
];

const RESULTS_DIR = path.resolve('monitor-results');

// Harte Obergrenze pro Suite. Schützt vor Hängern (z.B. global-setup blockiert auf
// nicht erreichbarem Staging) — Playwrights Test-Timeout greift NICHT für global-setup,
// also würde spawnSync sonst unbegrenzt blockieren bis die k8s activeDeadlineSeconds
// den ganzen Job killt (-> Argo "Degraded"). Mit diesem Timeout wird stattdessen nur
// die betroffene Suite als rot gewertet, der Lauf endet sauber und pusht die Metriken.
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;

// Hartes Limit für den zentralen Cross-Run-Cleanup, der EINMAL vor allen Suites läuft
// (statt 6x in jedem Suite-global-setup + 6x im -teardown). cleanup-staging.ts hat
// zusätzlich eine graceful Deadline (CLEANUP_DEADLINE_MS, Default 4 Min) darunter.
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000;
const PUSH_JOB = 'cosy-systemtest';

type SuiteResult = {
  name: string;
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationSec: number;
};

type PlaywrightStats = {
  expected?: number;
  unexpected?: number;
  skipped?: number;
  flaky?: number;
  duration?: number;
};

function runSuite(suite: SuiteDef): SuiteResult {
  const outFile = path.join(RESULTS_DIR, `${suite.name}.json`);
  fs.rmSync(outFile, { force: true });

  console.log(`\n=== Suite: ${suite.name} (npm run ${suite.script}) ===`);
  const run = spawnSync('npm', ['run', suite.script, '--', '--reporter=json'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    // SKIP_CROSSRUN_CLEANUP=1: der teure Orphan-Scan läuft zentral in runCleanup(),
    // nicht mehr in jedem Suite-global-setup/-teardown.
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outFile, SKIP_CROSSRUN_CLEANUP: '1' },
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });

  // spawnSync setzt bei Timeout run.error (ETIMEDOUT) und sendet killSignal -> status=null.
  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    console.error(
      `!! Suite "${suite.name}" nach ${SUITE_TIMEOUT_MS / 1000}s abgebrochen (Timeout) — gilt als fehlgeschlagen.`,
    );
  }

  const stats = readStats(outFile);
  const failed = stats.unexpected ?? 0;
  // Exit-Code des Runs zählt mit: bricht global-setup hart ab, gibt es evtl. keinen
  // brauchbaren Report -> dann gilt die Suite als fehlgeschlagen.
  const reportOk = stats.expected !== undefined || failed > 0;
  const success = run.status === 0 && failed === 0 && reportOk;

  return {
    name: suite.name,
    success,
    passed: stats.expected ?? 0,
    failed,
    skipped: stats.skipped ?? 0,
    flaky: stats.flaky ?? 0,
    durationSec: Math.round((stats.duration ?? 0) / 100) / 10,
  };
}

function readStats(outFile: string): PlaywrightStats {
  try {
    const json = JSON.parse(fs.readFileSync(outFile, 'utf-8')) as { stats?: PlaywrightStats };
    return json.stats ?? {};
  } catch {
    return {};
  }
}

// Zentraler Cross-Run-Cleanup: läuft EINMAL vor allen Suites (cleanup-users.json-Queue +
// Orphan-Admin-Scan über alle Staging-User). Best-effort: Fehler/Timeout werden nur
// geloggt und brechen den Lauf NICHT ab — die Suites laufen trotzdem, übrige Karteileichen
// räumt der nächste Lauf. Hart per spawnSync-Timeout begrenzt, damit ein hängender Scan
// nie den ganzen Job blockiert.
function runCleanup(): void {
  console.log('\n=== Cross-Run-Cleanup (einmalig, vor allen Suites) ===');
  const run = spawnSync('npm', ['run', 'cleanup:staging'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
    timeout: CLEANUP_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });

  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    console.warn(
      `!! Cross-Run-Cleanup nach ${CLEANUP_TIMEOUT_MS / 1000}s abgebrochen (Timeout) — ` +
        `Suites laufen trotzdem weiter, Rest wird im nächsten Lauf aufgeräumt.`,
    );
  } else if (run.status !== 0) {
    console.warn(
      `!! Cross-Run-Cleanup endete mit Status ${run.status} — Suites laufen trotzdem weiter.`,
    );
  }
}

function buildMetrics(results: SuiteResult[]): string {
  const now = Math.floor(Date.now() / 1000);
  const lines: string[] = [];
  const gauge = (name: string, help: string, samples: string[]) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(...samples);
  };

  gauge(
    'cosy_systemtest_suite_success',
    'Whether the suite passed (1) or failed (0) on its last run.',
    results.map((r) => `cosy_systemtest_suite_success{suite="${r.name}"} ${r.success ? 1 : 0}`),
  );
  gauge(
    'cosy_systemtest_suite_tests_passed',
    'Number of passed tests in the suite on its last run.',
    results.map((r) => `cosy_systemtest_suite_tests_passed{suite="${r.name}"} ${r.passed}`),
  );
  gauge(
    'cosy_systemtest_suite_tests_failed',
    'Number of failed tests in the suite on its last run.',
    results.map((r) => `cosy_systemtest_suite_tests_failed{suite="${r.name}"} ${r.failed}`),
  );
  gauge(
    'cosy_systemtest_suite_tests_skipped',
    'Number of skipped tests in the suite on its last run.',
    results.map((r) => `cosy_systemtest_suite_tests_skipped{suite="${r.name}"} ${r.skipped}`),
  );
  gauge(
    'cosy_systemtest_suite_tests_flaky',
    'Number of flaky tests in the suite on its last run.',
    results.map((r) => `cosy_systemtest_suite_tests_flaky{suite="${r.name}"} ${r.flaky}`),
  );
  gauge(
    'cosy_systemtest_suite_duration_seconds',
    'Wall-clock duration of the suite on its last run.',
    results.map(
      (r) => `cosy_systemtest_suite_duration_seconds{suite="${r.name}"} ${r.durationSec}`,
    ),
  );
  gauge('cosy_systemtest_run_success', 'Whether all suites passed (1) or not (0).', [
    `cosy_systemtest_run_success ${results.every((r) => r.success) ? 1 : 0}`,
  ]);
  gauge(
    'cosy_systemtest_last_run_timestamp_seconds',
    'Unix timestamp of the last completed monitoring run (for staleness/"did not run" alerts).',
    [`cosy_systemtest_last_run_timestamp_seconds ${now}`],
  );

  return `${lines.join('\n')}\n`;
}

async function push(body: string): Promise<void> {
  const base = process.env.PUSHGATEWAY_URL;
  if (!base) throw new Error('PUSHGATEWAY_URL ist nicht gesetzt.');

  const url = `${base.replace(/\/$/, '')}/metrics/job/${PUSH_JOB}`;
  const headers: Record<string, string> = { 'Content-Type': 'text/plain; version=0.0.4' };
  const user = process.env.PUSHGATEWAY_USERNAME;
  const pass = process.env.PUSHGATEWAY_PASSWORD;
  if (user && pass) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  // PUT ersetzt die komplette Gruppe -> keine Karteileichen alter Suites.
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    throw new Error(`Pushgateway antwortete ${res.status}: ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  runCleanup();

  const results = SUITES.map(runSuite);

  console.log('\n=== Zusammenfassung ===');
  for (const r of results) {
    console.log(
      `${r.success ? 'PASS' : 'FAIL'}  ${r.name.padEnd(8)} ` +
        `${r.passed}p / ${r.failed}f / ${r.skipped}s${r.flaky ? ` / ${r.flaky} flaky` : ''} ` +
        `(${r.durationSec}s)`,
    );
  }

  const body = buildMetrics(results);
  console.log(`\n=== Metriken ===\n${body}`);

  // Phase 1 (Test ohne Grafana): ohne PUSHGATEWAY_URL nur ausführen + loggen,
  // kein Push, Job bleibt grün. Phase 2: URL setzen -> Metriken gehen an Grafana.
  if (!process.env.PUSHGATEWAY_URL) {
    console.log('PUSHGATEWAY_URL nicht gesetzt — Push übersprungen (Dry-Run, siehe Metriken oben).');
    return;
  }

  try {
    await push(body);
    console.log(`Metriken an ${process.env.PUSHGATEWAY_URL} gepusht.`);
  } catch (error) {
    console.error(`Metrik-Push fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

void main();
