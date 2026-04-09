import type { ExportFormat } from '@trimmr/shared'

/** Resolved recorder output: container, codecs, and file extension for export. */
export interface ExportTarget {
  requestedFormat: ExportFormat
  outputFormat: ExportFormat
  outputMimeType: string
  recorderMimeType: string
  extension: string
}

function isMp4FamilyFormat(format: ExportFormat): boolean {
  return format === 'mp4' || format === 'm4v' || format === 'mov'
}

function outputMimeForMp4FamilyFormat(format: ExportFormat): string {
  return format === 'mov' ? 'video/quicktime' : 'video/mp4'
}

interface RecorderTarget {
  outputFormat: ExportFormat
  outputMimeType: string
  recorderMimeType: string
  extension: string
}

/**
 * Pure: chooses WebM/MP4 recorder MIME and extension from the requested format,
 * using only the injected `isTypeSupported` predicate (testable without `MediaRecorder`).
 */
export function resolveExportTarget(
  requestedFormat: ExportFormat,
  hasAudio: boolean,
  isTypeSupported: (mimeType: string) => boolean,
): ExportTarget {
  const webmRecorderMimeType = hasAudio
    ? isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
    : isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'

  const recorderTarget: RecorderTarget = {
    outputFormat: 'webm',
    outputMimeType: 'video/webm',
    recorderMimeType: webmRecorderMimeType,
    extension: 'webm',
  }

  if (isMp4FamilyFormat(requestedFormat)) {
    const mp4RecorderMimeType = isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
      ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
      : isTypeSupported('video/mp4')
        ? 'video/mp4'
        : null

    if (mp4RecorderMimeType) {
      recorderTarget.outputFormat = requestedFormat
      recorderTarget.outputMimeType = outputMimeForMp4FamilyFormat(requestedFormat)
      recorderTarget.recorderMimeType = mp4RecorderMimeType
      recorderTarget.extension = requestedFormat
    }
  }

  return {
    requestedFormat,
    outputFormat: recorderTarget.outputFormat,
    outputMimeType: recorderTarget.outputMimeType,
    recorderMimeType: recorderTarget.recorderMimeType,
    extension: recorderTarget.extension,
  }
}

/** Ordered fallbacks when the preferred WebM codec is unsupported or fails to construct. */
export const MEDIA_RECORDER_WEBM_FALLBACKS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** Unique ordered list: preferred first, then `MEDIA_RECORDER_WEBM_FALLBACKS`. */
export function webmRecorderMimeCandidates(preferredMimeType: string): string[] {
  const ordered = [preferredMimeType, ...MEDIA_RECORDER_WEBM_FALLBACKS]
  const seen = new Set<string>()
  const out: string[] = []
  for (const mime of ordered) {
    if (seen.has(mime)) {
      continue
    }
    seen.add(mime)
    out.push(mime)
  }
  return out
}

/**
 * Pure: UA sniffing for Safari / iOS WebKit export paths (seek-based export).
 * Pass `navigator.userAgent` from the browser; tests pass fixed strings.
 */
export function isWebKitExportUserAgent(userAgent: string): boolean {
  if (/Chrome|Chromium|CriOS|Edg|OPR/.test(userAgent)) {
    return false
  }
  return /AppleWebKit/.test(userAgent) && /Safari\//.test(userAgent)
}
