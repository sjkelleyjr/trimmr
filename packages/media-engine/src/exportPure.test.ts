import { describe, expect, it } from 'vitest'
import {
  buildTranscodeArgs,
  clampUnitInterval,
  detectImportFormat,
  estimateBitrateKbps,
  ffmpegTranscodeProgressFraction,
  formatExportFilename,
  MIME_TYPE_BY_EXPORT_FORMAT,
  outputExtensionForTranscode,
  playbackRenderProgressFraction,
  previewRenderProgressFraction,
  seekBasedRenderProgressFraction,
} from './exportPure'

describe('MIME_TYPE_BY_EXPORT_FORMAT', () => {
  it('covers every export format key', () => {
    expect(MIME_TYPE_BY_EXPORT_FORMAT.webm).toBe('video/webm')
    expect(MIME_TYPE_BY_EXPORT_FORMAT.mp4).toBe('video/mp4')
    expect(MIME_TYPE_BY_EXPORT_FORMAT.m4v).toBe('video/mp4')
    expect(MIME_TYPE_BY_EXPORT_FORMAT.gif).toBe('image/gif')
    expect(MIME_TYPE_BY_EXPORT_FORMAT['animated-webp']).toBe('image/webp')
  })
})

describe('outputExtensionForTranscode', () => {
  it('maps animated-webp to webp', () => {
    expect(outputExtensionForTranscode('animated-webp')).toBe('webp')
  })

  it('passes through other formats', () => {
    expect(outputExtensionForTranscode('webm')).toBe('webm')
    expect(outputExtensionForTranscode('mp4')).toBe('mp4')
    expect(outputExtensionForTranscode('m4v')).toBe('m4v')
    expect(outputExtensionForTranscode('gif')).toBe('gif')
  })
})

describe('buildTranscodeArgs', () => {
  it('mp4 uses faststart', () => {
    expect(buildTranscodeArgs('mp4', 'in.webm', 'out.mp4', 30)).toEqual([
      '-i',
      'in.webm',
      '-movflags',
      '+faststart',
      'out.mp4',
    ])
  })

  it('m4v uses the same mp4 mux flags', () => {
    expect(buildTranscodeArgs('m4v', 'in.webm', 'out.m4v', 30)).toEqual([
      '-i',
      'in.webm',
      '-movflags',
      '+faststart',
      'out.m4v',
    ])
  })

  it('gif clamps fps in vf', () => {
    expect(buildTranscodeArgs('gif', 'a', 'b.gif', 5)).toEqual([
      '-i',
      'a',
      '-vf',
      'fps=8',
      '-loop',
      '0',
      'b.gif',
    ])
    expect(buildTranscodeArgs('gif', 'a', 'b.gif', 60)).toEqual([
      '-i',
      'a',
      '-vf',
      'fps=30',
      '-loop',
      '0',
      'b.gif',
    ])
  })

  it('animated-webp loops', () => {
    expect(buildTranscodeArgs('animated-webp', 'x', 'y.webp', 12)).toEqual([
      '-i',
      'x',
      '-loop',
      '0',
      'y.webp',
    ])
  })

  it('webm passthrough', () => {
    expect(buildTranscodeArgs('webm', 'i', 'o.webm', 24)).toEqual(['-i', 'i', 'o.webm'])
  })
})

describe('estimateBitrateKbps', () => {
  it('is 0 when duration non-positive', () => {
    expect(estimateBitrateKbps(1000, 0)).toBe(0)
    expect(estimateBitrateKbps(1000, -1)).toBe(0)
  })

  it('computes kbps from bytes and ms', () => {
    // 1000 bytes over 1s → 8000 bits/s → 8 kbps → max(1, 8) = 8
    expect(estimateBitrateKbps(1000, 1000)).toBe(8)
  })
})

describe('detectImportFormat', () => {
  it('uses mime first', () => {
    expect(detectImportFormat('video/mp4', 'x.apng')).toBe('mp4')
    expect(detectImportFormat('video/quicktime', 'x.webm')).toBe('mp4')
  })

  it('falls back to apng extension', () => {
    expect(detectImportFormat('', 'still.apng')).toBe('apng')
    expect(detectImportFormat('application/octet-stream', 'animation.APNG')).toBe('apng')
  })

  it('falls back to webm and mp4 extensions when MIME is generic', () => {
    expect(detectImportFormat('application/octet-stream', 'clip.webm')).toBe('webm')
    expect(detectImportFormat('', 'movie.MP4')).toBe('mp4')
    expect(detectImportFormat('', 'iphone.MOV')).toBe('mp4')
    expect(detectImportFormat('application/octet-stream', 'tv.m4v')).toBe('mp4')
  })

  it('returns unknown when unmatched', () => {
    expect(detectImportFormat('', 'foo.bin')).toBe('unknown')
  })
})

describe('clampUnitInterval', () => {
  it('clamps to 0..1', () => {
    expect(clampUnitInterval(-1)).toBe(0)
    expect(clampUnitInterval(2)).toBe(1)
    expect(clampUnitInterval(0.5)).toBe(0.5)
  })
})

describe('ffmpegTranscodeProgressFraction', () => {
  it('clamps ffmpeg progress', () => {
    expect(ffmpegTranscodeProgressFraction(0.5)).toBe(0.5)
    expect(ffmpegTranscodeProgressFraction(99)).toBe(1)
  })
})

describe('previewRenderProgressFraction', () => {
  it('matches safe duration behavior', () => {
    const frame = 1000 / 30
    expect(previewRenderProgressFraction(0, frame, 1000)).toBeCloseTo(frame / 1000, 5)
  })
})

describe('seekBasedRenderProgressFraction', () => {
  it('tracks trim window', () => {
    expect(seekBasedRenderProgressFraction(0, 100, 0, 1000)).toBeCloseTo(0.1, 5)
    expect(seekBasedRenderProgressFraction(200, 100, 0, 1500)).toBeCloseTo(0.2, 5)
  })
})

describe('playbackRenderProgressFraction', () => {
  it('uses current time vs trim start', () => {
    expect(playbackRenderProgressFraction(500, 0, 1000)).toBe(0.5)
  })
})

describe('formatExportFilename', () => {
  it('builds stable basename', () => {
    expect(formatExportFilename(123, 'webm')).toBe('trimmr-export-123.webm')
  })
})
