import { request } from '@playwright/test';
import { readStagingStorageState } from './staging-auth';

export type AdminUserDto = {
  uuid: string;
  username: string;
  email: string;
  tier: 'FREE' | 'PLUS';
  verified: boolean;
  createdAt?: string;
};

export const TEST_USER_EMAIL_PREFIX = process.env.TEST_USER_EMAIL_PREFIX ?? 'playwright-';

const ALLOWED_TEST_MAIL_DOMAINS = new Set(
  (process.env.TEST_MAIL_DOMAIN_ALLOWLIST ?? `${process.env.TEST_MAIL_DOMAIN ?? 'example.org'},example.org`)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean),
);

export function getAdminKey(): string | undefined {
  return process.env.ADMIN_PORTAL_API_KEY;
}

export function isPlaywrightTestEmail(email: string): boolean {
  if (!email.toLowerCase().startsWith(TEST_USER_EMAIL_PREFIX.toLowerCase())) {
    return false;
  }
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return ALLOWED_TEST_MAIL_DOMAINS.has(email.slice(at + 1).toLowerCase());
}

export async function listAdminUsers(baseURL: string, adminKey: string): Promise<AdminUserDto[]> {
  const ctx = await request.newContext({ baseURL, storageState: readStagingStorageState() });
  try {
    const res = await ctx.get('/api/v1/admin/users', {
      headers: { 'X-Admin-Key': adminKey },
    });
    if (!res.ok()) {
      throw new Error(`Admin-User-Liste konnte nicht geladen werden: ${res.status()} ${await res.text()}`);
    }
    return (await res.json()) as AdminUserDto[];
  } finally {
    await ctx.dispose();
  }
}

export async function findAdminUserByEmail(
  baseURL: string,
  adminKey: string,
  email: string,
): Promise<AdminUserDto | undefined> {
  const users = await listAdminUsers(baseURL, adminKey);
  const target = email.toLowerCase();
  return users.find((u) => u.email.toLowerCase() === target);
}

export async function deleteUserAsAdmin(
  baseURL: string,
  uuid: string,
  adminKey: string,
): Promise<'deleted' | 'notfound'> {
  const ctx = await request.newContext({ baseURL, storageState: readStagingStorageState() });
  try {
    const res = await ctx.delete(`/api/v1/admin/users/${uuid}`, {
      headers: { 'X-Admin-Key': adminKey },
    });
    if (res.status() === 204 || res.status() === 200) return 'deleted';
    if (res.status() === 404) return 'notfound';
    throw new Error(`Admin-Delete fehlgeschlagen: ${res.status()} ${await res.text()}`);
  } finally {
    await ctx.dispose();
  }
}

export async function deleteOrphanPlaywrightUsers(
  baseURL: string,
  opts: { deadlineMs?: number } = {},
): Promise<{ deleted: string[]; failed: Array<{ email: string; reason: string }> }> {
  const adminKey = getAdminKey();
  const deleted: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  if (!adminKey) {
    return { deleted, failed };
  }

  const users = await listAdminUsers(baseURL, adminKey);
  const candidates = users.filter((u) => isPlaywrightTestEmail(u.email));

  // Graceful Zeitlimit: bei großem Karteileichen-Backlog + langsamem Staging würde die
  // sequentielle Schleife sonst unbegrenzt laufen. Mit Deadline brechen wir sauber ab
  // (Rest räumt der nächste Lauf) statt den ganzen Job in den k8s-Kill zu treiben.
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : undefined;

  for (const user of candidates) {
    if (deadline && Date.now() > deadline) {
      const remaining = candidates.length - deleted.length - failed.length;
      console.warn(
        `Orphan-Scan: Zeitlimit (${Math.round(opts.deadlineMs! / 1000)}s) erreicht — ` +
          `${remaining} von ${candidates.length} Karteileichen übrig, werden im nächsten Lauf gelöscht.`,
      );
      break;
    }
    try {
      const result = await deleteUserAsAdmin(baseURL, user.uuid, adminKey);
      if (result === 'deleted' || result === 'notfound') {
        deleted.push(user.email);
      }
    } catch (error) {
      failed.push({
        email: user.email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { deleted, failed };
}
