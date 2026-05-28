/*
 * Provisioniert stabile Fixture-Testuser in Staging — einmalig manuell laufen lassen.
 *
 * Aufruf:
 *   npm run provision:fixture-users -- default stripe
 *
 * Vorbedingungen (in .env.local oder Shell-Env):
 *   BASE_URL, STAGING_AUTH_USERNAME, STAGING_AUTH_PASSWORD, MAIL_SERVICE_API_KEY
 *
 * Verhalten:
 *   - Pro Rolle wird ein User mit fester Email "cosy-fixture-{role}@{TEST_MAIL_DOMAIN}"
 *     registriert, verifiziert und mit MFA versehen.
 *   - Prefix "cosy-fixture-" matcht NICHT den Admin-Cleanup-Filter ("playwright-"), die
 *     User bleiben also persistent.
 *   - Existiert ein User bereits (Login klappt), wird er übersprungen (idempotent).
 *   - Am Ende werden Email, Passwort und MFA-Secret pro Rolle ausgegeben. Diese Werte
 *     müssen manuell als GitHub Secrets gespeichert werden, z.B.:
 *       FIXTURE_USER_DEFAULT_EMAIL, FIXTURE_USER_DEFAULT_USERNAME,
 *       FIXTURE_USER_DEFAULT_PASSWORD, FIXTURE_USER_DEFAULT_MFA_SECRET.
 */
import { request } from '@playwright/test';
import * as crypto from 'crypto';
import { MailService } from '../tests/helpers/mail-service';
import { ensureAuthDir, STAGING_STATE_PATH } from '../tests/helpers/runtime-test-user';
import { setupStagingBarrier } from '../tests/helpers/staging-auth';
import { generateTotpCode } from '../tests/helpers/totp';
import { buildApiStorageState } from '../tests/helpers/fixture-user';
import * as fs from 'fs';

const VERIFY_MAIL_SUBJECT = 'Verify Your Account';

type ProvisionedUser = {
  role: string;
  email: string;
  username: string;
  password: string;
  mfaSecret: string;
  status: 'created' | 'already-exists';
};

async function tryFixtureLogin(
  baseURL: string,
  email: string,
  password: string,
): Promise<boolean> {
  const ctx = await request.newContext({
    baseURL,
    storageState: buildApiStorageState(baseURL),
  });
  try {
    const res = await ctx.post('/api/v1/auth/login?tokenMode=COOKIE', {
      data: { email, password, captchaToken: 'BYPASS' },
    });
    if (!res.ok()) return false;
    const body = (await res.json()) as { mfaRequired?: boolean };
    return body.mfaRequired === true;
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

async function provisionRole(baseURL: string, role: string): Promise<ProvisionedUser> {
  const mailDomain = process.env.TEST_MAIL_DOMAIN ?? 'example.org';
  const email = `cosy-fixture-${role}@${mailDomain}`;
  const username = `cosyfixture${role}`.replace(/[^a-zA-Z0-9]/g, '');
  const passwordSeed = process.env[`FIXTURE_USER_${role.toUpperCase()}_PASSWORD`];
  const password = passwordSeed ?? `CosyFixture!${crypto.randomBytes(8).toString('hex')}`;
  const mfaSeed = process.env[`FIXTURE_USER_${role.toUpperCase()}_MFA_SECRET`];

  if (passwordSeed && mfaSeed && (await tryFixtureLogin(baseURL, email, passwordSeed))) {
    return {
      role,
      email,
      username,
      password: passwordSeed,
      mfaSecret: mfaSeed,
      status: 'already-exists',
    };
  }

  const ctx = await request.newContext({
    baseURL,
    storageState: buildApiStorageState(baseURL),
  });
  const createdAt = new Date();
  let mfaSecret: string;

  try {
    const registerRes = await ctx.post('/api/v1/auth/register?tokenMode=COOKIE', {
      data: { email, username, password, captchaToken: 'BYPASS' },
    });
    if (registerRes.status() !== 201) {
      throw new Error(
        `Registrierung von ${email} fehlgeschlagen: ${registerRes.status()} ${await registerRes.text()}`,
      );
    }

    const tokenRes = await ctx.get('/api/v1/auth/token');
    if (!tokenRes.ok()) {
      throw new Error(`Identity-Token konnte nicht geholt werden: ${tokenRes.status()}`);
    }
    const identityToken = await tokenRes.text();

    const resendRes = await ctx.post('/api/v1/auth/resend-verification', {
      headers: { Authorization: `Bearer ${identityToken}` },
    });
    if (!resendRes.ok()) {
      throw new Error(`Resend-Verification fehlgeschlagen: ${resendRes.status()}`);
    }

    const mail = new MailService();
    const verifyMail = await mail.waitForMail({
      recipient: email,
      subjectContains: VERIFY_MAIL_SUBJECT,
      after: createdAt,
      timeoutMs: 120_000,
    });
    const token = mail.extractVerifyToken(verifyMail);

    const verifyRes = await ctx.post(`/api/v1/auth/verify?token=${token}`);
    if (!verifyRes.ok()) {
      throw new Error(`Account-Verifizierung fehlgeschlagen: ${verifyRes.status()} ${await verifyRes.text()}`);
    }

    const setupRes = await ctx.post('/api/v1/auth/mfa/setup', {
      headers: { Authorization: `Bearer ${identityToken}` },
    });
    if (!setupRes.ok()) {
      throw new Error(`MFA-Setup fehlgeschlagen: ${setupRes.status()}`);
    }
    const setupBody = (await setupRes.json()) as { secret?: string };
    if (!setupBody.secret) {
      throw new Error('MFA-Setup lieferte kein Secret.');
    }
    mfaSecret = setupBody.secret;

    const confirmRes = await ctx.post('/api/v1/auth/mfa/confirm', {
      headers: { Authorization: `Bearer ${identityToken}` },
      data: { totpCode: generateTotpCode(mfaSecret) },
    });
    if (!confirmRes.ok()) {
      throw new Error(`MFA-Bestätigung fehlgeschlagen: ${confirmRes.status()}`);
    }
  } finally {
    await ctx.dispose();
  }

  return { role, email, username, password, mfaSecret, status: 'created' };
}

async function main() {
  const roles = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (roles.length === 0) {
    console.error('Usage: npm run provision:fixture-users -- <role1> [role2 ...]');
    console.error('Beispiel: npm run provision:fixture-users -- default stripe');
    process.exit(2);
  }

  const baseURL = process.env.BASE_URL;
  if (!baseURL) {
    console.error('BASE_URL ist nicht gesetzt.');
    process.exit(2);
  }
  if (!process.env.MAIL_SERVICE_API_KEY) {
    console.error('MAIL_SERVICE_API_KEY ist nicht gesetzt — wird für Verify-Mail benötigt.');
    process.exit(2);
  }

  ensureAuthDir();
  await setupStagingBarrier({
    baseURL,
    username: process.env.STAGING_AUTH_USERNAME,
    password: process.env.STAGING_AUTH_PASSWORD,
  });

  if (!fs.existsSync(STAGING_STATE_PATH)) {
    console.error(`Staging-Auth-State (${STAGING_STATE_PATH}) wurde nicht angelegt.`);
    process.exit(2);
  }

  const results: ProvisionedUser[] = [];
  for (const role of roles) {
    console.log(`\n→ Provisioniere Rolle "${role}" ...`);
    try {
      const user = await provisionRole(baseURL, role);
      results.push(user);
      console.log(
        `  ${user.status === 'created' ? '✓ Neu angelegt' : '↻ Bereits vorhanden'}: ${user.email}`,
      );
    } catch (error) {
      console.error(
        `  ✗ Fehler bei Rolle "${role}": ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  console.log('\n=== GitHub Secrets (manuell setzen) ===');
  for (const u of results) {
    const prefix = `FIXTURE_USER_${u.role.toUpperCase()}`;
    console.log(`${prefix}_EMAIL=${u.email}`);
    console.log(`${prefix}_USERNAME=${u.username}`);
    console.log(`${prefix}_PASSWORD=${u.password}`);
    console.log(`${prefix}_MFA_SECRET=${u.mfaSecret}`);
    console.log('');
  }
  console.log('Speichere diese Werte als GitHub Repository Secrets und setze im Workflow');
  console.log('pro Matrix-Job die passenden FIXTURE_USER_EMAIL/USERNAME/PASSWORD/MFA_SECRET Variablen.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
