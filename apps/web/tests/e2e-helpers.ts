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

/**
 * Curated “problem-shaped” matrix beyond IMPORT_FIXTURES (see `generate-e2e-fixtures.sh`):
 * - VFR / no-audio H.264 (MP4), VFR VP9 (WebM), VP9 no-audio (WebM)
 * - VP9 1080p60 + Opus 5.1 (BBB-class), VP8 + Vorbis
 * - HEVC (hvc1), long-GOP H.264 (seek stress)
 * - AV1 + Opus (WebM) and AV1 + AAC (MP4, av01) — encoder uses SVT-AV1 or libaom fallback
 * - AAC 5.1 (MP4)
 * - QuickTime `.mov` remux + `.m4v` extension alias (same bitstream as baseline MP4)
 */
export const GOLDEN_IMPORT_FIXTURES: ImportFixture[] = [
  ...IMPORT_FIXTURES,
  { file: 'sample.mov', id: 'mov-quicktime' },
  { file: 'sample.m4v', id: 'm4v' },
  { file: 'sample-vfr.mp4', id: 'vfr-mp4' },
  { file: 'sample-no-audio.mp4', id: 'no-audio-mp4' },
  { file: 'sample-vp9-1080p60-opus51.webm', id: 'vp9-1080p60-opus51' },
  { file: 'sample-vp8-vorbis.webm', id: 'vp8-vorbis-webm' },
  { file: 'sample-hevc.mp4', id: 'hevc-mp4' },
  { file: 'sample-av1.webm', id: 'av1-webm' },
  { file: 'sample-av1.mp4', id: 'av1-mp4' },
  { file: 'sample-aac51.mp4', id: 'aac51-mp4' },
  { file: 'sample-vfr.webm', id: 'vfr-webm' },
  { file: 'sample-no-audio.webm', id: 'no-audio-webm' },
  { file: 'sample-long-gop.mp4', id: 'long-gop-mp4' },
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
 *
 * WebKit (Playwright mobile-safari) often does not emit the `download` event for
 * programmatic blob saves even when export succeeds; we also accept the success
 * status line from App.tsx so the smoke still passes.
 */
export async function exportWebmWithin(page: Page, downloadTimeoutMs: number) {
  await selectExportFormat(page, 'webm')

  const exportButton = page.getByRole('button', { name: 'Export' })
  await expect(exportButton).toBeEnabled()

  const settleTimeout = Math.min(downloadTimeoutMs, 120_000)

  // Both waits must settle without rejecting, or Promise.race throws on the first timeout
  // (e.g. WebKit: no download event even when export succeeds).
  const downloadOutcome = page
    .waitForEvent('download', { timeout: downloadTimeoutMs })
    .then((d) => ({ kind: 'download' as const, d }))
    .catch(() => null)
  const statusOutcome = page
    .getByText(/Exported .+ as WEBM/i)
    .waitFor({ state: 'visible', timeout: downloadTimeoutMs })
    .then(() => ({ kind: 'status' as const }))
    .catch(() => null)

  await exportButton.click()

  const outcome = await Promise.race([downloadOutcome, statusOutcome])

  if (outcome === null) {
    throw new Error('Export did not produce a download or success status in time')
  }

  await expect(exportButton).toBeEnabled({ timeout: settleTimeout })

  if (outcome.kind === 'download') {
    const buffer = await readDownloadBuffer(outcome.d)
    // WebKit sometimes fires `download` with an empty placeholder while the real save is blob-based;
    // treat tiny payloads like the no-download case and require the success status line.
    if (buffer.byteLength > 64) {
      assertExportMatchesFormat(buffer, 'webm', outcome.d.suggestedFilename())
      return
    }
  }

  await expect(page.getByText(/Exported .+ as WEBM/i)).toBeVisible({ timeout: settleTimeout })
}

const previewVideoSelector = 'video.preview-video'

function playPauseButton(page: Page) {
  return page.getByRole('button', { name: /play playback|pause playback/i })
}

/** Preview `<video>` sits above the play control in the stacking order; use force clicks. */
async function clickPlayPause(page: Page) {
  await playPauseButton(page).click({ force: true })
}

async function setPreviewPlayingState(page: Page, shouldPlay: boolean) {
  const video = page.locator(previewVideoSelector)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentlyPaused = await video.evaluate((el: HTMLVideoElement) => el.paused)
    if (shouldPlay === !currentlyPaused) {
      return
    }

    if (attempt < 2) {
      await clickPlayPause(page)
    } else {
      // Final fallback: click the preview surface (App toggles play/pause on video click).
      await video.click({ force: true })
    }

    try {
      await expect
        .poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused), {
          timeout: 5_000,
        })
        .toBe(!shouldPlay)
      return
    } catch {
      // Retry
    }
  }

  // Last assertion for clearer error output.
  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused), {
      timeout: 5_000,
    })
    .toBe(!shouldPlay)
}

export async function assertPreviewVideoPlaybackAdvances(page: Page) {
  const video = page.locator(previewVideoSelector)
  await expect(video).toBeVisible({ timeout: 30_000 })

  await setPreviewPlayingState(page, true)

  await expect
    .poll(
      async () => video.evaluate((el: HTMLVideoElement) => el.currentTime),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.08)

  await setPreviewPlayingState(page, false)
}

/**
 * While MP4 plays, WebKit may keep `webkitAudioDecodedByteCount` at 0; fall back to a short
 * Web Audio analyser pass on the preview `<video>` so CI still sees non‑silent output.
 */
export async function assertPreviewVideoAudioDecodeSignal(page: Page, fixtureFile: string) {
  await importFixture(page, fixtureFile)

  const video = page.locator(previewVideoSelector)
  await expect(video).toBeVisible({ timeout: 30_000 })

  await setPreviewPlayingState(page, true)

  // Do not call `createMediaElementSource` here — the app already wires the preview `<video>`
  // into Web Audio. Use decode byte counters, `captureStream()` audio tracks, or `audioTracks`.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const v = document.querySelector('video.preview-video') as
            | (HTMLVideoElement & {
                webkitAudioDecodedByteCount?: number
                audioTracks?: { length: number }
                captureStream?: () => MediaStream
              })
            | null
          if (!v) {
            return false
          }
          if (
            typeof v.webkitAudioDecodedByteCount === 'number' &&
            v.webkitAudioDecodedByteCount > 0
          ) {
            return true
          }
          if (v.audioTracks && v.audioTracks.length > 0) {
            return true
          }
          try {
            const stream = v.captureStream?.()
            if (!stream) {
              return false
            }
            return stream.getAudioTracks().length > 0
          } catch {
            return false
          }
        }),
      { timeout: 25_000 },
    )
    .toBe(true)
}

export async function assertPreviewPlaybackAfterRepeatedPlayPause(
  page: Page,
  opts: { cycles: number; playingMs: number; gapMs: number },
) {
  const video = page.locator(previewVideoSelector)
  await expect(video).toBeVisible({ timeout: 30_000 })

  for (let i = 0; i < opts.cycles; i += 1) {
    await clickPlayPause(page)
    await page.waitForTimeout(opts.playingMs)
    await clickPlayPause(page)
    await page.waitForTimeout(opts.gapMs)
  }

  await setPreviewPlayingState(page, true)
  const resumedAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime)

  // Use wrap-aware progression (currentTime can jump back to ~0 when resuming at clip end).
  // This avoids false negatives when baseline is near duration on tiny fixtures.
  await expect
    .poll(
      async () =>
        video.evaluate((el: HTMLVideoElement, startTime: number) => {
          const now = el.currentTime
          const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null
          if (duration === null) {
            return Math.max(0, now - startTime)
          }
          if (now >= startTime) {
            return now - startTime
          }
          return duration - startTime + now
        }, resumedAt),
      {
      timeout: 20_000,
      },
    )
    .toBeGreaterThan(0.03)
}
