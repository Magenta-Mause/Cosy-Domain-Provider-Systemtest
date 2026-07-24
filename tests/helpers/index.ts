export { MailService } from './mail-service';
export type { Mail } from './mail-service';
export { STRIPE_TEST_CARD } from './stripe-test-data';
export { generateTotpCode } from './totp';
export { enableCaptchaBypass } from './captcha';
export * from './constants';
export {
  fetchIdentityToken,
  loginWithMfaViaApi,
  loginWithoutMfaViaApi,
  logoutKeepingStagingBarrier,
  registerTestUserViaApi,
  registerUser,
  setupMfaViaApi,
  triggerVerificationMail,
  verifyUserViaMailLink,
  waitForVerificationToken,
} from './auth-api';
export type { ApiTestUser, TestUserCredentials } from './auth-api';
export { resolveAuthoritativeA } from './dns';
export { fetchSubdomain } from './subdomain-api';
export type { SubdomainInfo } from './subdomain-api';
export {
  requireRuntimeTestUser,
  readRuntimeTestUserState,
  recordCleanupUser,
  updateCleanupUser,
  APP_USER_STATE_PATH,
  STAGING_STATE_PATH,
  TEST_USER_STATE_PATH,
} from './runtime-test-user';
export type { CleanupTestUser, RuntimeTestUser, RuntimeTestUserState } from './runtime-test-user';

export function generateTestEmail(domain = 'example.org'): string {
  return `playwright-${Date.now()}@${domain}`;
}
