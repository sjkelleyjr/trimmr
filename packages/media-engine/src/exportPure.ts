import type { ExportFormat, SupportedImportFormat } from '@trimmr/shared'
import { clamp } from '@trimmr/shared'

/** MIME for final blob after transcode / export. */
export const MIME_TYPE_BY_EXPORT_FORMAT: Record<ExportFormat, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  gif: 'image/gif',
  'animated-webp': 'image/webp',
}

/** File extension FFmpeg writes for a given export format (`animated-webp` → `webp`). */
export function outputExtensionForTranscode(outputFormat: ExportFormat): string {
  return outputFormat === 'animated-webp' ? 'webp' : outputFormat
}

export function buildTranscodeArgs(
  outputFormat: ExportFormat,
  inputFilename: string,
  outputFilename: string,
  fps: number,
): string[] {
  if (outputFormat === 'mp4' || outputFormat === 'm4v' || outputFormat === 'mov') {
    return ['-i', inputFilename, '-movflags', '+faststart', outputFilename]
  }

  if (outputFormat === 'gif') {
    const targetFps = Math.max(8, Math.min(30, Math.round(fps)))
    return ['-i', inputFilename, '-vf', `fps=${targetFps}`, '-loop', '0', outputFilename]
  }

  if (outputFormat === 'animated-webp') {
    return ['-i', inputFilename, '-loop', '0', outputFilename]
  }

  return ['-i', inputFilename, outputFilename]
}

export function estimateBitrateKbps(fileSizeBytes: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0
  }

  return Math.max(1, Math.round((fileSizeBytes * 8) / (durationMs / 1000) / 1000))
}

/**
 * Pure import sniffing from MIME + filename (mirrors previous `File`-based `detectFormat`).
 */
export function detectImportFormat(mimeType: string, fileName: string): SupportedImportFormat {
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return 'mp4'
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'animated-webp'
  if (mimeType === 'image/apng') return 'apng'
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.apng')) return 'apng'
  if (lower.endsWith('.webm')) return 'webm'
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.mov')) return 'mp4'
  return 'unknown'
}

export function clampUnitInterval(n: number): number {
  return clamp(n, 0, 1)
}

export function ffmpegTranscodeProgressFraction(eventProgress: number): number {
  return clampUnitInterval(eventProgress)
}

/** Progress through preview frames (export preview WebM). */
export function previewRenderProgressFraction(
  timeMs: number,
  frameDurationMs: number,
  durationMs: number,
): number {
  const safeDurationMs = Math.max(frameDurationMs, durationMs)
  return clampUnitInterval((timeMs + frameDurationMs) / safeDurationMs)
}

/** WebKit seek-based export loop. */
export function seekBasedRenderProgressFraction(
  tMs: number,
  frameDurationMs: number,
  trimStartMs: number,
  trimDuration: number,
): number {
  return clampUnitInterval((tMs + frameDurationMs - trimStartMs) / trimDuration)
}

/** Playback-driven export loop (`currentTime` in ms). */
export function playbackRenderProgressFraction(
  currentTimeMs: number,
  trimStartMs: number,
  trimDuration: number,
): number {
  return clampUnitInterval((currentTimeMs - trimStartMs) / trimDuration)
}

export function formatExportFilename(timestampMs: number, extension: string): string {
  return `trimmr-export-${timestampMs}.${extension}`
}
