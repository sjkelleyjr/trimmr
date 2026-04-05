import { test } from '@playwright/test'
import {
  assertPreviewPlaybackAfterRepeatedPlayPause,
  assertPreviewVideoAudioDecodeSignal,
  assertPreviewVideoPlaybackAdvances,
  importFixture,
} from './e2e-helpers'

test.describe('Preview playback', () => {
  test('preview video currentTime advances after play, then pauses', async ({ page }) => {
    await page.goto('/')
    await importFixture(page, 'sample.webm')
    await assertPreviewVideoPlaybackAdvances(page)
  })

  /**
   * Not a microphone test — `e2e-helpers` checks `webkitAudioDecodedByteCount` / `captureStream`,
   * then a **Web Audio analyser** on the preview `<video>` so Playwright WebKit still sees signal
   * when byte counters stay at zero.
   */
  test('preview MP4 shows audio decode signal while playing', async ({ page }) => {
    await page.goto('/')
    await assertPreviewVideoAudioDecodeSignal(page, 'sample.mp4')
  })

  /**
   * Regression: rapid play/pause (async seek + `play()` racing pause). Requires a long enough
   * `sample.webm` so the clip does not hit `ended` mid-loop (see `generate-e2e-fixtures.sh`).
   */
  test('preview video still plays after rapid play/pause cycles', async ({ page }) => {
    await page.goto('/')
    await importFixture(page, 'sample.webm')
    await assertPreviewPlaybackAfterRepeatedPlayPause(page, {
      cycles: 14,
      playingMs: 45,
      gapMs: 15,
    })
  })
})
