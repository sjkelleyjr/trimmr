import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Download, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const fixturesDir = path.join(__dirname, 'fixtures')

export type E2eExportFormat = 'webm' | 'mp4' | 'gif' | 'animated-webp'

export const EXPORT_FORMATS: E2eExportFormat[] = ['webm', 'mp4', 'gif', 'animated-webp']

export interface ImportFixture {
  /** File name inside `tests/fixtures` */
  file: string
  /** Short id for test titles */
  id: string
}

export const IMPORT_FIXTURES: ImportFixture[] = [
  { file: 'sample.webm', id: 'webm' },
  { file: 'sample.mp4', id: 'mp4' },
  { file: 'sample.gif', id: 'gif' },
  { file: 'sample-animated.webp', id: 'animated-webp' },
  { file: 'sample.apng', id: 'apng' },
]

function expectedExtension(format: E2eExportFormat): string {
  if (format === 'animated-webp') {
    return 'webp'
  }
  return format
}

export async function importFixture(page: Page, fixtureFile: string) {
  const filePath = path.join(fixturesDir, fixtureFile)
  const fileInput = page.locator('.file-picker input[type="file"]')
  await fileInput.setInputFiles(filePath)
  await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled({ timeout: 60_000 })
}

export async function addCaptionAndCommit(page: Page, text: string) {
  await page.getByRole('button', { name: 'Add caption' }).click({ force: true })
  await page.getByPlaceholder('Caption text').fill(text)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(text, { exact: true })).toBeVisible()
}

export async function setTrimStartMs(page: Page, value: string) {
  const slider = page.getByRole('slider', { name: 'Trim start' })
  await slider.fill(value)
}

export async function setTrimEndMs(page: Page, value: string) {
  const slider = page.getByRole('slider', { name: 'Trim end' })
  await slider.fill(value)
}

export async function setPlaybackSpeed(page: Page, value: string) {
  const slider = page.getByRole('slider', { name: /playback speed/i })
  await slider.fill(value)
}

export async function selectExportFormat(page: Page, format: E2eExportFormat) {
  await page.getByLabel('Format').selectOption(format)
}

export async function readDownloadBuffer(download: Download): Promise<Buffer> {
  const safeName = download.suggestedFilename().replace(/[/\\]/g, '_')
  const target = path.join(tmpdir(), `looplab-e2e-${Date.now()}-${safeName}`)
  await download.saveAs(target)
  try {
    return readFileSync(target)
  } finally {
    try {
      unlinkSync(target)
    } catch {
      /* ignore */
    }
  }
}

export function assertExportMatchesFormat(
  buffer: Buffer,
  format: E2eExportFormat,
  suggestedFilename: string,
) {
  const ext = expectedExtension(format)
  expect(suggestedFilename.toLowerCase().endsWith(`.${ext}`)).toBe(true)
  expect(buffer.byteLength).toBeGreaterThan(200)

  switch (format) {
    case 'webm': {
      expect(buffer.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
      return
    }
    case 'mp4': {
      expect(buffer.subarray(4, 8).toString('ascii')).toBe('ftyp')
      return
    }
    case 'gif': {
      expect(buffer.subarray(0, 3).toString('ascii')).toMatch(/^GIF/)
      return
    }
    case 'animated-webp': {
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP')
      return
    }
  }
}

export async function exportAndAssertFormat(page: Page, format: E2eExportFormat) {
  await selectExportFormat(page, format)

  const exportButton = page.getByRole('button', { name: 'Export' })
  await expect(exportButton).toBeEnabled()

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    exportButton.click(),
  ])

  await expect(exportButton).toBeEnabled({ timeout: 180_000 })

  const buffer = await readDownloadBuffer(download)
  assertExportMatchesFormat(buffer, format, download.suggestedFilename())
}
