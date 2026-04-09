import { describe, expect, it } from 'vitest'
import {
  isWebKitExportUserAgent,
  MEDIA_RECORDER_WEBM_FALLBACKS,
  resolveExportTarget,
  webmRecorderMimeCandidates,
} from './exportResolve'

describe('resolveExportTarget', () => {
  it('prefers vp9+opus for webm with audio when supported', () => {
    const t = resolveExportTarget('webm', true, (m) => m === 'video/webm;codecs=vp9,opus')
    expect(t.requestedFormat).toBe('webm')
    expect(t.outputFormat).toBe('webm')
    expect(t.recorderMimeType).toBe('video/webm;codecs=vp9,opus')
    expect(t.extension).toBe('webm')
  })

  it('falls back through vp9 variants for webm with audio', () => {
    const t = resolveExportTarget(
      'webm',
      true,
      (m) => m === 'video/webm;codecs=vp9' || m === 'video/webm',
    )
    expect(t.recorderMimeType).toBe('video/webm;codecs=vp9')
  })

  it('uses plain webm when no codec-specific mime is supported (with audio)', () => {
    const t = resolveExportTarget('webm', true, () => false)
    expect(t.recorderMimeType).toBe('video/webm')
  })

  it('prefers vp9 without opus branch for webm without audio', () => {
    const t = resolveExportTarget('webm', false, (m) => m === 'video/webm;codecs=vp9')
    expect(t.recorderMimeType).toBe('video/webm;codecs=vp9')
  })

  it('selects mp4 when requested and H.264+AAC mime is supported', () => {
    const t = resolveExportTarget(
      'mp4',
      true,
      (m) => m === 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    )
    expect(t.outputFormat).toBe('mp4')
    expect(t.outputMimeType).toBe('video/mp4')
    expect(t.extension).toBe('mp4')
    expect(t.recorderMimeType).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
  })

  it('falls back to generic video/mp4 when codec string unsupported', () => {
    const t = resolveExportTarget('mp4', true, (m) => m === 'video/mp4')
    expect(t.outputFormat).toBe('mp4')
    expect(t.recorderMimeType).toBe('video/mp4')
  })

  it('keeps m4v on webm record path for stability', () => {
    const t = resolveExportTarget('m4v', true, (m) => m === 'video/mp4')
    expect(t.outputFormat).toBe('webm')
    expect(t.outputMimeType).toBe('video/webm')
    expect(t.extension).toBe('webm')
  })

  it('selects mov when requested and mp4 recorder MIME is supported', () => {
    const t = resolveExportTarget('mov', true, (m) => m === 'video/mp4')
    expect(t.outputFormat).toBe('mov')
    expect(t.outputMimeType).toBe('video/quicktime')
    expect(t.extension).toBe('mov')
    expect(t.recorderMimeType).toBe('video/mp4')
  })

  it('stays on webm when mp4 is requested but not supported', () => {
    const t = resolveExportTarget('mp4', true, () => false)
    expect(t.outputFormat).toBe('webm')
    expect(t.extension).toBe('webm')
  })
})

describe('webmRecorderMimeCandidates', () => {
  it('puts preferred first then fallbacks, deduped', () => {
    const preferred = 'video/webm;codecs=vp9,opus'
    const got = webmRecorderMimeCandidates(preferred)
    expect(got[0]).toBe(preferred)
    expect(new Set(got).size).toBe(got.length)
    expect(got).toEqual([preferred, ...MEDIA_RECORDER_WEBM_FALLBACKS.slice(1)])
  })

  it('includes full fallback chain when preferred is not in the list', () => {
    const preferred = 'video/webm;codecs=custom-test'
    const got = webmRecorderMimeCandidates(preferred)
    expect(got[0]).toBe(preferred)
    expect(got.length).toBe(1 + MEDIA_RECORDER_WEBM_FALLBACKS.length)
  })

  it('does not duplicate when preferred matches a fallback', () => {
    const preferred = 'video/webm;codecs=vp9'
    const got = webmRecorderMimeCandidates(preferred)
    expect(got.filter((m) => m === preferred).length).toBe(1)
  })
})

describe('isWebKitExportUserAgent', () => {
  it('is true for typical Safari desktop UA', () => {
    expect(
      isWebKitExportUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe(true)
  })

  it('is false for Chrome', () => {
    expect(
      isWebKitExportUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false)
  })

  it('is false for empty string', () => {
    expect(isWebKitExportUserAgent('')).toBe(false)
  })
})
