/*
 * Standalone-Cleanup für Staging:
 *  - Stellt zuerst Staging-Barrier-Auth her (Basic Auth → Cookie).
 *  - Verarbeitet alle Einträge aus .auth/cleanup-users.json (Admin-Delete bevorzugt, sonst Self-Delete).
 *  - Wenn ADMIN_PORTAL_API_KEY gesetzt: scannt /api/v1/admin/users nach `playwright-*` Karteileichen
 *    und löscht sie via Admin-API.
 *
 * Aufruf:
 *   npm run cleanup:staging
 */
import { deleteOrphanPlaywrightUsers, getAdminKey } from '../tests/helpers/admin-cleanup';
import { processCleanupQueue } from '../tests/helpers/cleanup';
import { ensureAuthDir } from '../tests/helpers/runtime-test-user';
import { setupStagingBarrier } from '../tests/helpers/staging-auth';

async function main() {
  ensureAuthDir();
  const baseURL = process.env.BASE_URL;
  if (!baseURL) {
    console.error('BASE_URL ist nicht gesetzt. Setze BASE_URL=https://... vor dem Aufruf.');
    process.exit(2);
  }

  console.log(`Cleanup gegen ${baseURL} ...`);

  await setupStagingBarrier({
    baseURL,
    username: process.env.STAGING_AUTH_USERNAME,
    password: process.env.STAGING_AUTH_PASSWORD,
  });

  const queueResult = await processCleanupQueue(baseURL);
  console.log(
    `cleanup-users.json: gelöscht=${queueResult.deleted.length}, fehlgeschlagen=${queueResult.failed.length}`,
  );
  for (const f of queueResult.failed) {
    console.warn(`  fail: ${f.email} – ${f.reason}`);
  }

  if (!getAdminKey()) {
    console.log('ADMIN_PORTAL_API_KEY nicht gesetzt — überspringe Admin-Scan.');
    return;
  }

  try {
    // Graceful Zeitlimit für den Scan (Default 4 Min). Liegt bewusst unter dem harten
    // spawnSync-Timeout des Monitor-Runners, damit der Scan sauber abbricht und seine
    // Teilergebnisse loggt, statt hart gekillt zu werden.
    const deadlineMs = Number(process.env.CLEANUP_DEADLINE_MS ?? 4 * 60 * 1000);
    const orphanResult = await deleteOrphanPlaywrightUsers(baseURL, { deadlineMs });
    console.log(
      `Admin-Scan: gelöscht=${orphanResult.deleted.length}, fehlgeschlagen=${orphanResult.failed.length}`,
    );
    for (const f of orphanResult.failed) {
      console.warn(`  fail: ${f.email} – ${f.reason}`);
    }
  } catch (error) {
    console.warn(
      `Admin-Scan übersprungen: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

main().catch((error) => {
  console.error('Cleanup-Run hat einen Fehler geworfen:', error);
  process.exit(1);
});
