import { describe, expect, it } from 'vitest'
import type { SourceMedia } from '@trimmr/shared'
import {
  getSafariCompatibilityAssessment,
  getSafariSpecificCompatibilityWarning,
  SAFARI_COMPATIBILITY_BASE_WARNING,
} from './safariCompatibility'

function makeVideoSource(overrides: Partial<SourceMedia> = {}): SourceMedia {
  return {
    id: 'source_1',
    name: 'sample.webm',
    objectUrl: 'blob:sample',
    mimeType: 'video/webm; codecs="vp9,opus"',
    kind: 'video',
    format: 'webm',
    width: 1920,
    height: 1080,
    durationMs: 10_000,
    fileSizeBytes: 5_000_000,
    estimatedBitrateKbps: 4000,
    audioTrackStatus: 'present',
    ...overrides,
  }
}

describe('getSafariSpecificCompatibilityWarning', () => {
  it('returns null when not WebKit', () => {
    const warning = getSafariSpecificCompatibilityWarning(makeVideoSource(), false)
    expect(warning).toBeNull()
  })

  it('returns specific warning for WebM + Opus', () => {
    const warning = getSafariSpecificCompatibilityWarning(makeVideoSource(), true)
    expect(warning).toContain('Opus')
    expect(warning).toContain('Safari')
  })

  it('returns WebM warning when codecs are unknown', () => {
    const warning = getSafariSpecificCompatibilityWarning(
      makeVideoSource({ mimeType: 'video/webm', name: 'clip.webm' }),
      true,
    )
    expect(warning).toContain('WebM')
  })

  it('returns explicit reason codes for capability checks', () => {
    const unsupported = getSafariCompatibilityAssessment(
      makeVideoSource({ mimeType: 'video/webm', name: 'clip.webm' }),
      true,
      () => '',
    )
    expect(unsupported.reason).toBe('webm_capability_missing')

    const unknownCodec = getSafariCompatibilityAssessment(
      makeVideoSource({ mimeType: 'video/webm', name: 'clip.webm' }),
      true,
      () => 'maybe',
    )
    expect(unknownCodec.reason).toBe('webm_codec_unknown')

    const opusFromProbe = getSafariCompatibilityAssessment(
      makeVideoSource({
        mimeType: 'video/webm',
        importCodecProbe: { sniffedContainer: 'webm', webmCodecIds: ['A_OPUS'] },
      }),
      true,
      () => 'maybe',
    )
    expect(opusFromProbe.reason).toBe('webm_opus_risk')

    const generalRisk = getSafariCompatibilityAssessment(
      makeVideoSource({ mimeType: 'video/webm; codecs="vp9"', name: 'clip.webm' }),
      true,
      () => 'probably',
    )
    expect(generalRisk.reason).toBe('webm_general_risk')
  })

  it('returns null for non-WebM videos so caller can show generic fallback', () => {
    const warning = getSafariSpecificCompatibilityWarning(
      makeVideoSource({
        format: 'mp4',
        name: 'clip.mp4',
        mimeType: 'video/mp4; codecs="avc1.640028,mp4a.40.2"',
      }),
      true,
    )
    expect(warning).toBeNull()
    expect(SAFARI_COMPATIBILITY_BASE_WARNING).toContain('Safari support for some file types')
  })
})
