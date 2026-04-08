import type { SourceMedia } from '@trimmr/shared'

export const SAFARI_COMPATIBILITY_BASE_WARNING =
  'Safari support for some file types and codecs is limited. If this file is not working properly, consider using a Chromium-based browser like Chrome or Brave.'
export type SafariCompatibilityReason =
  | 'not_webkit'
  | 'no_source'
  | 'non_video_source'
  | 'webm_opus_risk'
  | 'webm_codec_unknown'
  | 'webm_capability_missing'
  | 'webm_general_risk'
  | 'no_specific_warning'

export interface SafariCompatibilityAssessment {
  reason: SafariCompatibilityReason
  warning: string | null
}

function parseMimeCodecs(mimeType: string): string[] {
  const raw = mimeType.toLowerCase()
  const match = raw.match(/codecs\s*=\s*"([^"]+)"/)
  if (!match?.[1]) {
    return []
  }
  return match[1]
    .split(',')
    .map((codec) => codec.trim())
    .filter((codec) => codec.length > 0)
}

function hasExtension(name: string, extension: string): boolean {
  return name.toLowerCase().endsWith(extension.toLowerCase())
}

function defaultCanPlayType(mimeType: string): string {
  if (typeof document === 'undefined') {
    return ''
  }
  const video = document.createElement('video')
  return video.canPlayType(mimeType)
}

export function getSafariCompatibilityAssessment(
  source: SourceMedia | null,
  isWebKit: boolean,
  canPlayType: (mimeType: string) => string = defaultCanPlayType,
): SafariCompatibilityAssessment {
  if (!isWebKit) {
    return { reason: 'not_webkit', warning: null }
  }
  if (!source) {
    return { reason: 'no_source', warning: null }
  }
  if (source.kind !== 'video') {
    return { reason: 'non_video_source', warning: null }
  }

  const mimeType = source.mimeType.toLowerCase()
  const codecs = parseMimeCodecs(source.mimeType)
  const isLikelyWebm =
    source.format === 'webm' || mimeType.startsWith('video/webm') || hasExtension(source.name, '.webm')
  const hasOpus = codecs.some((codec) => codec.includes('opus'))

  if (isLikelyWebm && hasOpus) {
    return {
      reason: 'webm_opus_risk',
      warning:
        'This WebM file appears to use Opus audio, which can fail during Safari playback and seeking. If it does not work reliably, use Chrome or Brave, or convert to MP4.',
    }
  }

  if (isLikelyWebm) {
    const webmCapability = canPlayType('video/webm')
    if (!webmCapability) {
      return {
        reason: 'webm_capability_missing',
        warning:
          'Safari reports limited WebM playback support on this device. If this file does not work properly, try Chrome or Brave.',
      }
    }
    return {
      reason: codecs.length > 0 ? 'webm_general_risk' : 'webm_codec_unknown',
      warning:
        'Safari support for WebM varies by codec and can be unreliable for playback or seeking. If this file does not work properly, try Chrome or Brave.',
    }
  }

  return { reason: 'no_specific_warning', warning: null }
}

export function getSafariSpecificCompatibilityWarning(
  source: SourceMedia | null,
  isWebKit: boolean,
): string | null {
  return getSafariCompatibilityAssessment(source, isWebKit).warning
}
