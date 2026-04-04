import { test } from '@playwright/test'
import { exportWebmWithin, importFixture } from './e2e-helpers'

/**
 * Runs on Playwright mobile device profiles (see playwright.config.ts).
 * If video export hangs (common on real iOS Safari; may or may not reproduce under emulation),
 * `waitForEvent('download')` hits the timeout and this test fails — that is the expected signal.
 */
test.describe('Mobile export smoke', () => {
  test('WebM export completes within budget (regression: stuck exporting)', async ({ page }) => {
    await page.goto('/')
    await importFixture(page, 'sample.webm')
    await exportWebmWithin(page, 120_000)
  })
})
