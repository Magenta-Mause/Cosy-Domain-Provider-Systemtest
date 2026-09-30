import { request } from '@playwright/test';

const MAIL_SERVICE_URL = 'https://mail-service.jannekeipert.de';

// `after` stammt von der lokalen Uhr, `sentAt` vom Mail-Service. Geht die lokale Uhr
// vor, fällt eine sofort verschickte Mail sonst durch den Filter. Empfänger sind pro
// Lauf eindeutig, die Toleranz lässt also keine fremden Mails durch.
const CLOCK_SKEW_TOLERANCE_MS = 30_000;

export interface Mail {
  uuid: string;
  recipient: string;
  subject: string;
  body: string;
  sentAt: string;
  success: boolean;
  html: boolean;
  errorMessage: string | null;
}

export class MailService {
  private readonly apiKey: string;

  constructor() {
    const key = process.env.MAIL_SERVICE_API_KEY;
    if (!key) throw new Error('MAIL_SERVICE_API_KEY is not set');
    this.apiKey = key;
  }

  async getMails(opts: { page?: number; size?: number } = {}): Promise<Mail[]> {
    const params = new URLSearchParams({
      sort: 'sentAt,desc',
      size: String(opts.size ?? 50),
      page: String(opts.page ?? 0),
    });

    const ctx = await request.newContext();
    try {
      const res = await ctx.get(`${MAIL_SERVICE_URL}/api/v1/mails?${params}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok()) throw new Error(`Mail service error: ${res.status()} ${await res.text()}`);
      const data = await res.json();
      return data.content as Mail[];
    } finally {
      await ctx.dispose();
    }
  }

  async waitForMail(opts: {
    recipient: string;
    subjectContains: string;
    after: Date;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<Mail> {
    const { recipient, subjectContains, after, timeoutMs = 90_000, pollIntervalMs = 2_000 } = opts;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const mails = await this.getMails({ size: 50 });
      const found = mails.find(
        (m) =>
          m.recipient === recipient &&
          m.subject.includes(subjectContains) &&
          new Date(m.sentAt).getTime() > after.getTime() - CLOCK_SKEW_TOLERANCE_MS,
      );
      if (found) {
        if (!found.success) {
          throw new Error(
            `Mail an "${recipient}" mit Betreff "${found.subject}" wurde laut Mail-API nicht erfolgreich zugestellt: ${found.errorMessage ?? 'keine Fehlermeldung'}`,
          );
        }
        return found;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(
      `Timeout (${timeoutMs}ms): Keine Mail an "${recipient}" mit Betreff "${subjectContains}" nach ${after.toISOString()} gefunden`,
    );
  }

  extractVerifyToken(mail: Mail): string {
    const match = mail.body.match(/[?&]token=([A-Z0-9]{6})/);
    if (!match) throw new Error('Verify-Token nicht in Mail gefunden');
    return match[1];
  }

  extractResetPasswordToken(mail: Mail): string {
    const match = mail.body.match(/reset-password\?token=([a-f0-9-]{36})/);
    if (!match) throw new Error('Reset-Token nicht in Mail gefunden');
    return match[1];
  }
}
