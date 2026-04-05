import type {
  CropRect,
  EditorProject,
  TimelineClip,
  TimelineSnapshot,
} from './types'

export const DEFAULT_EXPORT_PRESET = {
  format: 'webm',
  width: 720,
  height: 720,
  fps: 24,
} as const

export const DEFAULT_CROP: CropRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatPreciseDuration(ms: number) {
  const totalMs = Math.max(0, Math.round(ms))
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const milliseconds = totalMs % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`
}

export function clipDurationMs(clip: TimelineClip) {
  return Math.max(0, clip.trimEndMs - clip.trimStartMs)
}

export function outputDurationMs(clip: TimelineClip) {
  const d = clipDurationMs(clip)
  if (d <= 0) {
    return 0
  }
  const rounded = Math.round(d / clip.playbackRate)
  // Avoid 0 when the trim is non-empty: rounding can yield 0 at extreme playback rates and
  // breaks timeline mapping (output 0 would be treated as "at end").
  return Math.max(1, rounded)
}

export function sourceTimeToOutputTimeMs(clip: TimelineClip, sourceTimeMs: number) {
  const boundedSourceTime = clamp(sourceTimeMs, clip.trimStartMs, clip.trimEndMs)
  return Math.round((boundedSourceTime - clip.trimStartMs) / clip.playbackRate)
}

export function lastSourceFrameTimeMs(clip: TimelineClip, framePaddingMs = 34) {
  return clamp(clip.trimEndMs - framePaddingMs, clip.trimStartMs, clip.trimEndMs)
}

export function projectDurationMs(project: EditorProject) {
  if (!project.clip) {
    return 0
  }

  return outputDurationMs(project.clip)
}

export function timelineSnapshot(project: EditorProject): TimelineSnapshot {
  const sourceDurationMs = project.source?.durationMs ?? 0
  const visibleDurationMs = projectDurationMs(project)

  return {
    durationMs: sourceDurationMs,
    visibleDurationMs,
    startLabel: formatDuration(0),
    endLabel: formatDuration(visibleDurationMs),
  }
}
