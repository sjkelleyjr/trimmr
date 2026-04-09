export type SupportedMediaKind = 'video' | 'animated-image'

export type SupportedImportFormat =
  | 'mp4'
  | 'webm'
  | 'gif'
  | 'animated-webp'
  | 'apng'
  | 'unknown'

export type ExportFormat = 'webm' | 'mp4' | 'm4v' | 'gif' | 'animated-webp'
export type AudioTrackStatus = 'present' | 'absent' | 'unknown'

/**
 * Byte-sniffed hints from the file head (and MP4 tail) at import time.
 * Used when MIME/filename are missing or wrong (e.g. octet-stream WebM).
 */
export interface ImportCodecProbe {
  sniffedContainer: SupportedImportFormat
  /** Matroska CodecID strings found in the scan window (e.g. V_VP9, A_OPUS). */
  webmCodecIds?: readonly string[]
  /** ISO BMFF `stsd` sample entry types (e.g. avc1, hvc1, mp4a). */
  mp4SampleEntryTypes?: readonly string[]
  /** Major brand from `ftyp` (e.g. isom, mp42). */
  mp4MajorBrand?: string
}

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
  /** WebKit: same file as `objectUrl`; assign to `<video>.srcObject` to avoid blob-URL seek churn. */
  videoSrcBlob?: Blob
  /** Present for imports that ran container/codec sniffing (video path). */
  importCodecProbe?: ImportCodecProbe
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
    | 'session_started'
    | 'workflow_opened'
    | 'file_import_started'
    | 'file_import_succeeded'
    | 'file_import_failed'
    | 'trim_changed'
    | 'playback_rate_changed'
    | 'feature_used'
    | 'overlay_updated'
    | 'export_started'
    | 'export_succeeded'
    | 'export_failed'
  timestamp: string
  metadata?: Record<string, string | number | boolean>
}
