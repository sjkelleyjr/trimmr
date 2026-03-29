export type SupportedMediaKind = 'video' | 'animated-image'

export type SupportedImportFormat =
  | 'mp4'
  | 'webm'
  | 'gif'
  | 'animated-webp'
  | 'apng'
  | 'unknown'

export type ExportFormat = 'webm' | 'mp4' | 'gif' | 'animated-webp'
export type AudioTrackStatus = 'present' | 'absent' | 'unknown'

export interface SourceMedia {
  id: string
  name: string
  objectUrl: string
  mimeType: string
  kind: SupportedMediaKind
  format: SupportedImportFormat
  width: number
  height: number
  durationMs: number
  fileSizeBytes: number
  estimatedBitrateKbps: number
  audioTrackStatus: AudioTrackStatus
  frameRate?: number
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TimelineClip {
  id: string
  sourceId: string
  trimStartMs: number
  trimEndMs: number
  playbackRate: number
  crop: CropRect
}

export interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  color: string
  backgroundOpacity: number
}

export interface ExportPreset {
  format: ExportFormat
  width: number
  height: number
  fps: number
}

export interface EditorProject {
  version: 1
  createdAt: string
  updatedAt: string
  source: SourceMedia | null
  clip: TimelineClip | null
  overlays: TextOverlay[]
  exportPreset: ExportPreset
}

export interface TimelineSnapshot {
  durationMs: number
  visibleDurationMs: number
  startLabel: string
  endLabel: string
}

export interface AnalyticsEvent {
  name:
    | 'file_imported'
    | 'import_failed'
    | 'trim_changed'
    | 'playback_rate_changed'
    | 'overlay_updated'
    | 'draft_saved'
    | 'export_started'
    | 'export_completed'
    | 'export_failed'
  timestamp: string
  metadata?: Record<string, string | number | boolean>
}
