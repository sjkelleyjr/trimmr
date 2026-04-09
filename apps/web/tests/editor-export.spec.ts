import { expect, test } from '@playwright/test'
import {
  EXPORT_FORMATS,
  IMPORT_FIXTURES,
  addCaptionAndCommit,
  exportAndAssertFormat,
  importFixture,
  setPlaybackSpeed,
  setTrimEndMs,
  setTrimStartMs,
} from './e2e-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Editor import and export matrix', () => {
  for (const source of IMPORT_FIXTURES) {
    test(`import ${source.id} then export every format`, async ({ page }) => {
      await page.goto('/')

      await importFixture(page, source.file)
      await addCaptionAndCommit(page, `${source.id} caption`)

      for (const format of EXPORT_FORMATS) {
        await exportAndAssertFormat(page, format)
      }
    })
  }
})

test.describe('Editing controls (video)', () => {
  test('trim, playback speed, caption, undo, then export WebM', async ({ page }) => {
    await page.goto('/')
    await importFixture(page, 'sample.webm')

    await setTrimStartMs(page, '150')
    await setTrimEndMs(page, '450')
    await setPlaybackSpeed(page, '1.25')

    await addCaptionAndCommit(page, 'Edited clip')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Edited clip', { exact: true })).toHaveCount(0)

    await addCaptionAndCommit(page, 'Final cut')

    await exportAndAssertFormat(page, 'webm')
  })
})

test.describe('M4V reliability', () => {
  for (const fixture of ['sample-vp9-1080p60-opus51.webm', 'sample-av1.mp4']) {
    test(`exports m4v without hanging: ${fixture}`, async ({ page }) => {
      await page.goto('/')
      await importFixture(page, fixture)
      await exportAndAssertFormat(page, 'm4v')
    })
  }
})
