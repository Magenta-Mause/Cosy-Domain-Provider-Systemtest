# Playwright-Image mit vorinstallierten Browsern, passend zur @playwright/test-Version.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# CI=1 aktiviert die Retries (2) aus playwright.config.ts — für Monitoring gewollt,
# damit transiente Aussetzer nicht als echte Fehler gemeldet werden.
ENV CI=1

# Führt alle Suites aus und pusht die Metriken an den Pushgateway.
CMD ["npx", "tsx", "scripts/monitor.ts"]
