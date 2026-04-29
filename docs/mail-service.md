# Mail Service — Testpostfach-API

Der Mail Service unter `https://mail-service.jannekeipert.de` fängt alle vom Backend gesendeten E-Mails ab und stellt sie per REST-API bereit. Tests können darüber Verification- und Password-Reset-Tokens auslesen, ohne Zugang zu einem echten Postfach zu benötigen.

## Konfiguration

```bash
# .env.local
MAIL_SERVICE_API_KEY=mk_<your-api-key>
```

## API-Referenz

### `GET /api/v1/mails`

Gibt eine paginierte Liste aller eingegangenen Mails zurück.

**Query-Parameter**

| Parameter | Typ    | Default | Beschreibung                        |
|-----------|--------|---------|-------------------------------------|
| `page`    | int    | `0`     | Seite (0-indexed)                   |
| `size`    | int    | `20`    | Einträge pro Seite                  |
| `sort`    | string | —       | z. B. `sentAt,desc`                 |

> Serverseitige Filterung (nach `recipient`, `subject` etc.) wird **nicht** unterstützt — clientseitig filtern.

**Antwort (gekürzt)**

```json
{
  "content": [
    {
      "uuid": "eaa22c2a-...",
      "recipient": "user@example.de",
      "subject": "[ COSY DOMAIN PROVIDER ] Verify Your Account",
      "body": "<!DOCTYPE html>...",
      "sentAt": "2026-04-29T14:29:49.663121Z",
      "success": true,
      "html": true,
      "errorMessage": null
    }
  ],
  "totalElements": 14,
  "totalPages": 3,
  "number": 0,
  "size": 5
}
```

### `GET /api/v1/mails/{uuid}`

Gibt eine einzelne Mail zurück (gleiche Felder wie oben).

## Bekannte E-Mail-Templates

### Account-Verifizierung

- **Subject:** `[ COSY DOMAIN PROVIDER ] Verify Your Account`
- **Token-Format:** 6 Zeichen, Großbuchstaben/Ziffern (`MDXK2G`)
- **Token im Body:** `href="…/verify?token=MDXK2G"` (ohne Bindestriche), `<code>MD-XK-2G</code>` (mit Bindestrichen im UI)
- **Gültigkeitsdauer:** 3 Stunden

Regex zum Extrahieren: `/[?&]token=([A-Z0-9]{6})/`

### Passwort-Reset

- **Subject:** `[ COSY DOMAIN PROVIDER ] Reset Your Password`
- **Token-Format:** UUID (`f270a4ad-230c-4d36-8cf3-7ec3449bae6f`)
- **Token im Body:** `href="…/reset-password?token=<uuid>"`
- **Gültigkeitsdauer:** 30 Minuten

Regex zum Extrahieren: `/reset-password\?token=([a-f0-9-]{36})/`

## Verwendung in Tests

Der `MailService`-Helper in `tests/helpers/mail-service.ts` kapselt die API:

```typescript
import { MailService } from '@helpers/mail-service';

const mail = new MailService();

// Wartet bis zu 30 s auf die Verifizierungsmail
const verifyMail = await mail.waitForMail({
  recipient: 'playwright-1234@example.de',
  subjectContains: 'Verify Your Account',
  after: testStartTime,
});

const token = mail.extractVerifyToken(verifyMail);
// → 'MDXK2G'
```

### Strategie für Test-E-Mail-Adressen

Da alle Mails über denselben SMTP-Relay laufen, muss jeder Test eine **eindeutige E-Mail-Adresse** verwenden, damit `waitForMail` nur die eigene Mail findet:

```typescript
// in tests/helpers/index.ts
export function generateTestEmail(): string {
  return `playwright-${Date.now()}@test.example.de`;
}
```

Der `recipient`-Filter in `waitForMail` arbeitet clientseitig — die Einzigartigkeit der Adresse verhindert Kollisionen zwischen parallelen Tests.

## Umgebungsvariablen

| Env var                | Zweck                         | Default |
|------------------------|-------------------------------|---------|
| `MAIL_SERVICE_API_KEY` | Bearer-Token für die Mail-API | —       |
