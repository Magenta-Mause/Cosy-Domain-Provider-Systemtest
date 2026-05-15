import * as fs from 'fs';
import { deleteOrphanPlaywrightUsers, getAdminKey } from './helpers/admin-cleanup';
import { processCleanupQueue } from './helpers/cleanup';
import {
  APP_USER_STATE_PATH,
  TEST_USER_STATE_PATH,
} from './helpers/runtime-test-user';

export default async function globalTeardown() {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  const queueResult = await processCleanupQueue(baseURL);
  if (queueResult.deleted.length > 0) {
    console.log(`Testuser-Cleanup: ${queueResult.deleted.length} User gelöscht.`);
  }
  if (queueResult.failed.length > 0) {
    const lines = queueResult.failed.map((f) => `  - ${f.email}: ${f.reason}`).join('\n');
    console.warn(
      `Testuser-Cleanup: ${queueResult.failed.length} permanente Fehler (siehe .auth/cleanup-failures.json):\n${lines}`,
    );
  }

  // Sicherheitsnetz: Admin-Scan auf Karteileichen, die nie in cleanup-users.json landeten
  // (z.B. wegen Setup-Crash vor recordCleanupUser, oder wegen Vergessens in Specs).
  if (getAdminKey()) {
    try {
      const orphanResult = await deleteOrphanPlaywrightUsers(baseURL);
      if (orphanResult.deleted.length > 0) {
        console.log(
          `Admin-Orphan-Scan (Teardown): ${orphanResult.deleted.length} Karteileichen gelöscht.`,
        );
      }
      if (orphanResult.failed.length > 0) {
        const lines = orphanResult.failed.map((f) => `  - ${f.email}: ${f.reason}`).join('\n');
        console.warn(
          `Admin-Orphan-Scan (Teardown): ${orphanResult.failed.length} fehlgeschlagen:\n${lines}`,
        );
      }
    } catch (error) {
      console.warn(
        `Admin-Orphan-Scan im Teardown übersprungen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  clearRuntimeAuthState();
}

function clearRuntimeAuthState() {
  for (const path of [APP_USER_STATE_PATH, TEST_USER_STATE_PATH]) {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  }
}
