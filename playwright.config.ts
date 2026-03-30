import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './apps/web/tests',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: true,
    actionTimeout: 30_000,
  },
  webServer: {
    command: 'npm run dev -w apps/web -- --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
})
