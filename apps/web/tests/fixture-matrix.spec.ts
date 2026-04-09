import { expect, test } from '@playwright/test'
import { GOLDEN_IMPORT_FIXTURES, importFixture } from './e2e-helpers'

/**
 * Deterministic import smoke across the golden fixture list (Chrome + WebKit desktop).
 * Full export matrix lives in `editor-export.spec.ts`.
 */
test.describe.configure({ mode: 'serial' })

for (const source of GOLDEN_IMPORT_FIXTURES) {
  test(`golden import: ${source.id}`, async ({ page }) => {
    await page.goto('/')
    await importFixture(page, source.file)

    const isVideo = /\.(webm|mp4|m4v)$/i.test(source.file)

    if (isVideo) {
      await expect(page.locator('video.preview-video')).toBeVisible({ timeout: 30_000 })
    } else {
      await expect(page.locator('canvas.preview-canvas')).toBeVisible({ timeout: 30_000 })
    }

    await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled()
  })
}
