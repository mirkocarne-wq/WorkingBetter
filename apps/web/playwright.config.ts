import { defineConfig, devices } from '@playwright/test';

/**
 * Test end-to-end della web app contro lo stack reale (API + Postgres + web).
 * - In locale: avvia infra e API/web come in docs/11 e lancia `pnpm e2e` (riusa i server su 3000/4000).
 * - In CI (E2E_START_SERVERS=1): Playwright avvia API e web da `dist`/`.next` già compilati; il database è il service Postgres.
 */
const startServers = process.env.E2E_START_SERVERS === '1';
const apiEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://wb:wb@localhost:5432/workingbetter',
  DB_APP_ROLE: 'wb_app',
  AUTH_MODE: 'dev',
  AUTH_DEV_SECRET: process.env.AUTH_DEV_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-1234',
  NOTES_MASTER_KEY: process.env.NOTES_MASTER_KEY ?? 'ab'.repeat(32),
  API_PORT: '4000',
  API_CORS_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_URL: 'http://localhost:4000',
  APP_BASE_URL: 'http://localhost:3000',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure', locale: 'it-IT', timezoneId: 'Europe/Rome' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: startServers
    ? [
        { command: 'node --enable-source-maps ../api/dist/main.js', url: 'http://localhost:4000/health', reuseExistingServer: false, timeout: 60_000, env: apiEnv },
        { command: './node_modules/.bin/next start -p 3000', url: 'http://localhost:3000/login', reuseExistingServer: false, timeout: 60_000, env: { NEXT_PUBLIC_API_URL: 'http://localhost:4000', APP_BASE_URL: 'http://localhost:3000' } },
      ]
    : undefined,
});
