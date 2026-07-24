import type { APIRequestContext, Page } from '@playwright/test';
import { VerifyPage } from '../pages';
import { enableCaptchaBypass } from './captcha';
import {
  CAPTCHA_BYPASS_TOKEN,
  MAIL_WAIT_TIMEOUT_MS,
  VERIFY_MAIL_SUBJECT,
} from './constants';
import { MailService } from './mail-service';
import {
  generateRuntimeTestUser,
  recordCleanupUser,
  updateCleanupUser,
} from './runtime-test-user';
import { readStagingStorageState } from './staging-auth';
import { generateTotpCode } from './totp';

/**
 * Zentrale Auth-API-Flows (Register, Verify, MFA, Login) — geteilt von Specs,
 * global-setup, fixture-user und Cleanup. In Specs immer diese Helfer verwenden,
 * statt die Endpunkte inline aufzurufen.
 *
 * Die low-level Funktionen nehmen einen APIRequestContext (`page.request` in Specs,
 * `request.newContext(...)` in Node-Setups); Cookies/Session bleiben im Context.
 */

export type TestUserCredentials = { email: string; username: string; password: string };
export type ApiTestUser = TestUserCredentials & { registeredAt: Date };

type LoginResponse = { mfaRequired?: boolean; challengeToken?: string };

export async function registerUser(
  api: APIRequestContext,
  user: TestUserCredentials,
  source: string,
): Promise<void> {
  // Vor dem Request in die Cleanup-Queue, damit der User auch dann abgeräumt wird,
  // wenn die Verbindung zwischen Anlage und Antwort abreißt.
  recordCleanupUser({ email: user.email, password: user.password, source });
  const res = await api.post('/api/v1/auth/register?tokenMode=COOKIE', {
    data: { ...user, captchaToken: CAPTCHA_BYPASS_TOKEN },
  });
  if (res.status() !== 201) {
    throw new Error(
      `Registrierung fehlgeschlagen (${user.email}): ${res.status()} ${await res.text()}`,
    );
  }
}

export async function fetchIdentityToken(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/v1/auth/token');
  if (!res.ok()) {
    throw new Error(
      `Identity-Token konnte nicht geholt werden: ${res.status()} ${await res.text()}`,
    );
  }
  return res.text();
}

/**
 * Die Registrierung erzeugt nur den Verifizierungs-Token, verschickt aber keine Mail
 * (UserVerificationService.issueVerificationToken). Erst resend-verification löst die
 * Verify-Mail aus — genau wie der echte /verify-Flow im Frontend.
 */
export async function triggerVerificationMail(api: APIRequestContext): Promise<void> {
  const identityToken = await fetchIdentityToken(api);
  const res = await api.post('/api/v1/auth/resend-verification', {
    headers: { Authorization: `Bearer ${identityToken}` },
  });
  if (!res.ok()) {
    throw new Error(`Resend-Verification fehlgeschlagen: ${res.status()} ${await res.text()}`);
  }
}

/** Wartet auf die Verify-Mail und extrahiert den Verifizierungs-Token/-Code. */
export async function waitForVerificationToken(
  email: string,
  after: Date,
  timeoutMs = MAIL_WAIT_TIMEOUT_MS,
): Promise<string> {
  const mail = new MailService();
  const verifyMail = await mail.waitForMail({
    recipient: email,
    subjectContains: VERIFY_MAIL_SUBJECT,
    after,
    timeoutMs,
  });
  return mail.extractVerifyToken(verifyMail);
}

/**
 * Standard-"Given" der Mail-Flow-Specs: generiert Credentials, registriert per API
 * (inkl. Captcha-Bypass + Cleanup-Queue) und stößt die Verifizierungsmail an.
 */
export async function registerTestUserViaApi(
  page: Page,
  opts: { source: string },
): Promise<ApiTestUser> {
  const creds = generateRuntimeTestUser();
  const registeredAt = new Date();
  await enableCaptchaBypass(page.context());
  await registerUser(page.request, creds, opts.source);
  await triggerVerificationMail(page.request);
  return { ...creds, registeredAt };
}

/** Wartet auf die Verify-Mail und bestätigt den Account über den Token-Link im Browser. */
export async function verifyUserViaMailLink(
  page: Page,
  user: { email: string; registeredAt: Date },
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  const token = await waitForVerificationToken(user.email, user.registeredAt, opts.timeoutMs);
  const verify = new VerifyPage(page);
  await verify.navigateWithToken(token);
  await verify.successMessage.waitFor({ state: 'visible' });
}

/**
 * Richtet MFA per API ein (token → mfa/setup → mfa/confirm) und hinterlegt das
 * Secret in der Cleanup-Queue. Liefert das TOTP-Secret zurück.
 */
export async function setupMfaViaApi(api: APIRequestContext, email: string): Promise<string> {
  const identityToken = await fetchIdentityToken(api);
  const authHeader = { Authorization: `Bearer ${identityToken}` };

  const setupRes = await api.post('/api/v1/auth/mfa/setup', { headers: authHeader });
  if (!setupRes.ok()) {
    throw new Error(`MFA-Setup fehlgeschlagen: ${setupRes.status()} ${await setupRes.text()}`);
  }
  const setupBody = (await setupRes.json()) as { secret?: string };
  if (!setupBody.secret) {
    throw new Error(`MFA-Setup lieferte kein Secret: ${JSON.stringify(setupBody)}`);
  }
  updateCleanupUser(email, { mfaSecret: setupBody.secret });

  const confirmRes = await api.post('/api/v1/auth/mfa/confirm', {
    headers: authHeader,
    data: { totpCode: generateTotpCode(setupBody.secret) },
  });
  if (!confirmRes.ok()) {
    throw new Error(
      `MFA-Bestätigung fehlgeschlagen: ${confirmRes.status()} ${await confirmRes.text()}`,
    );
  }

  return setupBody.secret;
}

/** Login, der zwingend eine MFA-Challenge erwartet und sie mit dem TOTP-Secret löst. */
export async function loginWithMfaViaApi(
  api: APIRequestContext,
  user: { email: string; password: string; mfaSecret: string },
): Promise<void> {
  const loginRes = await api.post('/api/v1/auth/login?tokenMode=COOKIE', {
    data: { email: user.email, password: user.password, captchaToken: CAPTCHA_BYPASS_TOKEN },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Login fehlgeschlagen (${user.email}): ${loginRes.status()} ${await loginRes.text()}`,
    );
  }
  const loginBody = (await loginRes.json()) as LoginResponse;
  if (!loginBody.mfaRequired || !loginBody.challengeToken) {
    throw new Error(`Login hat keine MFA-Challenge geliefert: ${JSON.stringify(loginBody)}`);
  }

  const challengeRes = await api.post('/api/v1/auth/mfa/challenge?tokenMode=COOKIE', {
    data: {
      challengeToken: loginBody.challengeToken,
      totpCode: generateTotpCode(user.mfaSecret),
    },
  });
  if (!challengeRes.ok()) {
    throw new Error(
      `MFA-Challenge fehlgeschlagen: ${challengeRes.status()} ${await challengeRes.text()}`,
    );
  }
}

/**
 * Login, der KEINE MFA-Challenge erwartet — der leere Response-Body beweist,
 * dass das Backend für den User kein MFA (mehr) verlangt.
 */
export async function loginWithoutMfaViaApi(
  api: APIRequestContext,
  creds: { email: string; password: string },
): Promise<void> {
  const res = await api.post('/api/v1/auth/login?tokenMode=COOKIE', {
    data: { ...creds, captchaToken: CAPTCHA_BYPASS_TOKEN },
  });
  if (!res.ok()) {
    throw new Error(`Login fehlgeschlagen (${creds.email}): ${res.status()} ${await res.text()}`);
  }
  const body = await res.text();
  if (body !== '') {
    throw new Error(`Login sollte ohne MFA durchgehen, Backend lieferte aber: ${body}`);
  }
}

/**
 * App-Session ausloggen, aber Staging-Barrier + Captcha-Bypass behalten —
 * clearCookies() entfernt sonst auch die Staging-Auth und die nächste Seite
 * landet hinter der Staging-Sperre (lokal kein Effekt, leerer State).
 */
export async function logoutKeepingStagingBarrier(page: Page): Promise<void> {
  await page.context().clearCookies();
  const stagingCookies = readStagingStorageState().cookies;
  if (stagingCookies.length > 0) {
    await page.context().addCookies(stagingCookies);
  }
  await enableCaptchaBypass(page.context());
}
