export const DEFAULT_BASE_URL = 'http://localhost:5173';

/** Ziel-URL der Tests — einzige Stelle, die BASE_URL auswertet. */
export function resolveBaseURL(): string {
  return process.env.BASE_URL ?? DEFAULT_BASE_URL;
}

/** True, wenn die Tests gegen das deployte Staging laufen (nicht lokal). */
export function isStagingTarget(): boolean {
  return /staging|cosy-hosting\.net/i.test(process.env.BASE_URL ?? '');
}

// Captcha-Bypass: der Backend-CaptchaService akzeptiert das Token "BYPASS" nur,
// wenn gleichzeitig das CAPTCHA_BYPASS-Cookie gesetzt ist (Staging/Dev-Feature).
export const CAPTCHA_BYPASS_COOKIE = 'CAPTCHA_BYPASS';
export const CAPTCHA_BYPASS_TOKEN = 'BYPASS';

// Mail-Betreffzeilen des Backends — bei Änderung nur hier anpassen.
export const VERIFY_MAIL_SUBJECT = 'Verify Your Account';
export const RESET_PASSWORD_MAIL_SUBJECT = 'Reset';

// Mail-Zustellung aus CI dauert teils 30–60s.
export const MAIL_WAIT_TIMEOUT_MS = 90_000;
// Test-Budget für Specs mit bis zu zwei Mail-Waits hintereinander.
export const MAIL_FLOW_TEST_TIMEOUT_MS = 240_000;
