import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Sandboxes (e.g. Cursor) may set PLAYWRIGHT_BROWSERS_PATH to an empty cache while
 * `playwright install` already populated ~/Library/Caches/ms-playwright (macOS) or
 * ~/.cache/ms-playwright (Linux). Point at the real cache so WebKit does not need a
 * second download.
 *
 * Playwright has no --browsers-path flag; to force a path from the shell use:
 * `PLAYWRIGHT_BROWSERS_PATH=/path/to/ms-playwright npx playwright test …`
 */
function ensurePlaywrightBrowsersPath(): void {
  const standard =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
      : path.join(os.homedir(), '.cache', 'ms-playwright')

  function cacheHasPlaywrightBrowsers(root: string): boolean {
    try {
      return fs.readdirSync(root).some((name) =>
        /^(chromium|chromium_headless_shell|webkit|firefox)/.test(name),
      )
    } catch {
      return false
    }
  }

  const current = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (current && cacheHasPlaywrightBrowsers(current)) {
    return
  }

  if (current) {
    const looksBroken =
      current.includes('cursor-sandbox') ||
      current.includes('sandbox-cache') ||
      !cacheHasPlaywrightBrowsers(current)
    if (looksBroken && cacheHasPlaywrightBrowsers(standard)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = standard
      return
    }
  }

  if (!current && cacheHasPlaywrightBrowsers(standard)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = standard
  }
}

ensurePlaywrightBrowsersPath()

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
