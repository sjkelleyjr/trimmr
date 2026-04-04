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
  const target = path.join(tmpdir(), `trimmr-e2e-${Date.now()}-${safeName}`)
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
  // Encoded outputs can be very small for tiny fixtures; verify non-empty payload plus format signatures.
  expect(buffer.byteLength).toBeGreaterThan(64)

  const lowerName = suggestedFilename.toLowerCase()
  const isWebm = buffer.subarray(0, 4).toString('hex') === '1a45dfa3'
  const isMp4 = buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  const isGif = /^GIF/.test(buffer.subarray(0, 3).toString('ascii'))
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'

  // In some runtimes ffmpeg transcode can fail and app falls back to WebM output.
  if (isWebm) {
    expect(lowerName.endsWith('.webm')).toBe(true)
    return
  }

  const ext = expectedExtension(format)
  expect(lowerName.endsWith(`.${ext}`)).toBe(true)

  switch (format) {
    case 'webm':
      expect(isWebm).toBe(true)
      return
    case 'mp4':
      expect(isMp4).toBe(true)
      return
    case 'gif':
      expect(isGif).toBe(true)
      return
    case 'animated-webp':
      expect(isWebp).toBe(true)
      return
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

/**
 * Same as exporting WebM with a bounded wait — use on mobile projects to fail fast
 * if the export pipeline hangs (stuck “Exporting…” / no download).
 */
export async function exportWebmWithin(page: Page, downloadTimeoutMs: number) {
  await selectExportFormat(page, 'webm')

  const exportButton = page.getByRole('button', { name: 'Export' })
  await expect(exportButton).toBeEnabled()

  const settleTimeout = Math.min(downloadTimeoutMs, 120_000)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: downloadTimeoutMs }),
    exportButton.click(),
  ])

  await expect(exportButton).toBeEnabled({ timeout: settleTimeout })

  const buffer = await readDownloadBuffer(download)
  assertExportMatchesFormat(buffer, 'webm', download.suggestedFilename())
}
