import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build served exactly as GitHub
 * Pages serves it: under /stylist/, with 404.html as the fallback for deep
 * links. The API lives at a fake origin (https://api.folia.test) that every
 * test intercepts, so no test reaches Anthropic, Google or any real server.
 */

const PORT = 4321;
export const BASE_PATH = '/stylist/';
export const API_ORIGIN = 'https://api.folia.test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build:e2e && node scripts/pages-server.mjs --dir dist-e2e --base ${BASE_PATH} --port ${PORT}`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    env: { BASE_PATH, VITE_API_BASE_URL: API_ORIGIN },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
