import type { SourceMedia } from '@trimmr/shared'

export const SAFARI_COMPATIBILITY_BASE_WARNING =
  'Safari support for some file types and codecs is limited. If this file is not working properly, consider using a Chromium-based browser like Chrome or Brave.'

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

export function getSafariSpecificCompatibilityWarning(
  source: SourceMedia | null,
  isWebKit: boolean,
): string | null {
  if (!isWebKit || !source || source.kind !== 'video') {
    return null
  }

  const mimeType = source.mimeType.toLowerCase()
  const codecs = parseMimeCodecs(source.mimeType)
  const isLikelyWebm =
    source.format === 'webm' || mimeType.startsWith('video/webm') || hasExtension(source.name, '.webm')
  const hasOpus = codecs.some((codec) => codec.includes('opus'))

  if (isLikelyWebm && hasOpus) {
    return 'This WebM file appears to use Opus audio, which can fail during Safari playback and seeking. If it does not work reliably, use Chrome or Brave, or convert to MP4.'
  }

  if (isLikelyWebm) {
    return 'Safari support for WebM varies by codec and can be unreliable for playback or seeking. If this file does not work properly, try Chrome or Brave.'
  }

  return null
}
