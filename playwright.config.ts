import { defineConfig, devices } from '@playwright/test'

/** Mobile-focused specs (viewport + export); keeps mobile CI fast vs full editor matrix. */
const mobileOnlyGlobs = ['**/mobile-overflow.spec.ts', '**/mobile-export.spec.ts']

export default defineConfig({
  testDir: './apps/web/tests',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: 'chrome-desktop',
      use: {
        channel: 'chrome',
      },
      testIgnore: '**/mobile-export.spec.ts',
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
      testMatch: mobileOnlyGlobs,
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
      },
      testMatch: mobileOnlyGlobs,
    },
  ],
  webServer: {
    command: 'npm run dev -w apps/web -- --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
})
