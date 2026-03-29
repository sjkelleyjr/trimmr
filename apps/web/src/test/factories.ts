import { createProjectFromSource } from '@looplab/editor-core'
import type { EditorProject, SourceMedia } from '@looplab/shared'

export function createSourceMedia(overrides: Partial<SourceMedia> = {}): SourceMedia {
  return {
    id: 'source-1',
    name: 'clip.mp4',
    objectUrl: 'blob:test',
    mimeType: 'video/mp4',
    kind: 'video',
    format: 'mp4',
    width: 1280,
    height: 720,
    durationMs: 8_000,
    fileSizeBytes: 2_000_000,
    estimatedBitrateKbps: 2000,
    audioTrackStatus: 'present',
    ...overrides,
  }
}

export function createProject(overrides: Partial<EditorProject> = {}) {
  return {
    ...createProjectFromSource(createSourceMedia()),
    ...overrides,
  }
}
