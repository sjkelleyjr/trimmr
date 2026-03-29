import {
  DEFAULT_CROP,
  DEFAULT_EXPORT_PRESET,
  clamp,
  createId,
} from '@looplab/shared'
import type { EditorProject, SourceMedia, TextOverlay } from '@looplab/shared'

const DEFAULT_OVERLAY_FONT_FAMILY = 'Inter, system-ui, sans-serif'
const DEFAULT_OVERLAY_BACKGROUND_OPACITY = 0.45

function parseLegacyBackgroundOpacity(value: unknown) {
  if (typeof value !== 'string') {
    return DEFAULT_OVERLAY_BACKGROUND_OPACITY
  }

  const match = value.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i)
  if (!match) {
    return DEFAULT_OVERLAY_BACKGROUND_OPACITY
  }

  const opacity = Number(match[1])
  return Number.isFinite(opacity) ? clamp(opacity, 0, 1) : DEFAULT_OVERLAY_BACKGROUND_OPACITY
}

function normalizeOverlay(overlay: TextOverlay & { background?: unknown }): TextOverlay {
  return {
    ...overlay,
    fontFamily: overlay.fontFamily || DEFAULT_OVERLAY_FONT_FAMILY,
    backgroundOpacity:
      typeof overlay.backgroundOpacity === 'number'
        ? clamp(overlay.backgroundOpacity, 0, 1)
        : parseLegacyBackgroundOpacity(overlay.background),
  }
}

function normalizeProject(project: EditorProject): EditorProject {
  return {
    ...project,
    overlays: project.overlays.map((overlay) => normalizeOverlay(overlay as TextOverlay & { background?: unknown })),
  }
}

function cloneWithUpdatedAt(project: EditorProject): EditorProject {
  const nextProject = structuredClone(project)
  nextProject.updatedAt = new Date().toISOString()
  return nextProject
}

export type EditorCommand =
  | { type: 'hydrate'; project: EditorProject }
  | { type: 'set-source'; source: SourceMedia }
  | { type: 'set-trim'; trimStartMs: number; trimEndMs: number }
  | { type: 'set-playback-rate'; playbackRate: number }
  | {
      type: 'add-overlay'
      text?: string
      x?: number
      y?: number
      fontSize?: number
      fontFamily?: string
      color?: string
      backgroundOpacity?: number
    }
  | { type: 'delete-overlay'; overlayId: string }
  | { type: 'set-overlay-text'; overlayId: string; text: string }
  | { type: 'set-overlay-position'; overlayId: string; x: number; y: number }
  | { type: 'set-overlay-font-size'; overlayId: string; fontSize: number }
  | {
      type: 'set-overlay-style'
      overlayId: string
      color?: string
      fontFamily?: string
      backgroundOpacity?: number
    }
  | { type: 'set-export-size'; width: number; height: number }
  | { type: 'set-export-format'; format: EditorProject['exportPreset']['format'] }

export interface HistoryState {
  past: EditorProject[]
  present: EditorProject
  future: EditorProject[]
}

export function createEmptyProject(): EditorProject {
  const timestamp = new Date().toISOString()

  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: null,
    clip: null,
    overlays: [],
    exportPreset: { ...DEFAULT_EXPORT_PRESET },
  }
}

export function createProjectFromSource(source: SourceMedia): EditorProject {
  const overlay: TextOverlay = {
    id: createId('overlay'),
    text: '',
    x: 0.86,
    y: 0.9,
    fontSize: 24,
    fontFamily: DEFAULT_OVERLAY_FONT_FAMILY,
    color: '#ffffff',
    backgroundOpacity: DEFAULT_OVERLAY_BACKGROUND_OPACITY,
  }

  return {
    ...createEmptyProject(),
    updatedAt: new Date().toISOString(),
    source,
    clip: {
      id: createId('clip'),
      sourceId: source.id,
      trimStartMs: 0,
      trimEndMs: source.durationMs,
      playbackRate: 1,
      crop: { ...DEFAULT_CROP },
    },
    overlays: [overlay],
    exportPreset: {
      ...DEFAULT_EXPORT_PRESET,
      width: Math.min(1080, source.width || DEFAULT_EXPORT_PRESET.width),
      height: Math.min(1080, source.height || DEFAULT_EXPORT_PRESET.height),
    },
  }
}

export function applyCommand(project: EditorProject, command: EditorCommand): EditorProject {
  if (command.type === 'hydrate') {
    return normalizeProject(command.project)
  }

  if (command.type === 'set-source') {
    return createProjectFromSource(command.source)
  }

  if (!project.source || !project.clip) {
    return project
  }

  switch (command.type) {
    case 'set-trim': {
      const trimStartMs = clamp(command.trimStartMs, 0, project.source.durationMs)
      const trimEndMs = clamp(command.trimEndMs, trimStartMs + 100, project.source.durationMs)
      if (
        trimStartMs === project.clip.trimStartMs &&
        trimEndMs === project.clip.trimEndMs
      ) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      const nextClip = nextProject.clip as NonNullable<EditorProject['clip']>
      nextClip.trimStartMs = trimStartMs
      nextClip.trimEndMs = trimEndMs
      return nextProject
    }
    case 'set-playback-rate': {
      const playbackRate = clamp(command.playbackRate, 0.25, 3)
      if (playbackRate === project.clip.playbackRate) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      const nextClip = nextProject.clip as NonNullable<EditorProject['clip']>
      nextClip.playbackRate = playbackRate
      return nextProject
    }
    case 'add-overlay': {
      const nextProject = cloneWithUpdatedAt(project)
      nextProject.overlays.push({
        id: createId('overlay'),
        text: command.text ?? '',
        x: clamp(command.x ?? 0.5, 0.05, 0.95),
        y: clamp(command.y ?? 0.82, 0.05, 0.95),
        fontSize: Math.max(12, command.fontSize ?? 24),
        fontFamily: command.fontFamily ?? DEFAULT_OVERLAY_FONT_FAMILY,
        color: command.color ?? '#ffffff',
        backgroundOpacity: clamp(
          command.backgroundOpacity ?? DEFAULT_OVERLAY_BACKGROUND_OPACITY,
          0,
          1,
        ),
      })
      return nextProject
    }
    case 'delete-overlay': {
      const overlayExists = project.overlays.some((item) => item.id === command.overlayId)
      if (!overlayExists) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      nextProject.overlays = nextProject.overlays.filter((item) => item.id !== command.overlayId)
      return nextProject
    }
    case 'set-overlay-text': {
      const overlay = project.overlays.find((item) => item.id === command.overlayId)
      if (!overlay || command.text === overlay.text) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      const nextOverlay = nextProject.overlays.find((item) => item.id === command.overlayId)
      if (!nextOverlay) {
        return project
      }
      nextOverlay.text = command.text
      return nextProject
    }
    case 'set-overlay-position': {
      const x = clamp(command.x, 0.05, 0.95)
      const y = clamp(command.y, 0.05, 0.95)
      const overlay = project.overlays.find((item) => item.id === command.overlayId)
      if (!overlay || (x === overlay.x && y === overlay.y)) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      const nextOverlay = nextProject.overlays.find((item) => item.id === command.overlayId)
      if (!nextOverlay) {
        return project
      }
      nextOverlay.x = x
      nextOverlay.y = y
      return nextProject
    }
    case 'set-overlay-font-size': {
      const fontSize = Math.max(12, command.fontSize)
      const overlay = project.overlays.find((item) => item.id === command.overlayId)
      if (!overlay || fontSize === overlay.fontSize) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      const nextOverlay = nextProject.overlays.find((item) => item.id === command.overlayId)
      if (!nextOverlay) {
        return project
      }
      nextOverlay.fontSize = fontSize
      return nextProject
    }
    case 'set-overlay-style': {
      const overlay = project.overlays.find((item) => item.id === command.overlayId)
      if (!overlay) {
        return project
      }

      const color = command.color ?? overlay.color
      const fontFamily = command.fontFamily ?? overlay.fontFamily
      const backgroundOpacity = clamp(command.backgroundOpacity ?? overlay.backgroundOpacity, 0, 1)

      if (
        color === overlay.color &&
        fontFamily === overlay.fontFamily &&
        backgroundOpacity === overlay.backgroundOpacity
      ) {
        return project
      }

      const nextProject = cloneWithUpdatedAt(project)
      const nextOverlay = nextProject.overlays.find((item) => item.id === command.overlayId)
      if (!nextOverlay) {
        return project
      }
      nextOverlay.color = color
      nextOverlay.fontFamily = fontFamily
      nextOverlay.backgroundOpacity = backgroundOpacity
      return nextProject
    }
    case 'set-export-size': {
      const width = clamp(command.width, 240, 1080)
      const height = clamp(command.height, 240, 1920)
      if (
        width === project.exportPreset.width &&
        height === project.exportPreset.height
      ) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      nextProject.exportPreset.width = width
      nextProject.exportPreset.height = height
      return nextProject
    }
    case 'set-export-format': {
      if (command.format === project.exportPreset.format) {
        return project
      }
      const nextProject = cloneWithUpdatedAt(project)
      nextProject.exportPreset.format = command.format
      return nextProject
    }
  }
}

export function createHistory(initialProject: EditorProject = createEmptyProject()): HistoryState {
  return {
    past: [],
    present: initialProject,
    future: [],
  }
}

export function commit(history: HistoryState, command: EditorCommand): HistoryState {
  const next = applyCommand(history.present, command)
  if (JSON.stringify(next) === JSON.stringify(history.present)) {
    return history
  }

  return {
    past: [...history.past, history.present],
    present: next,
    future: [],
  }
}

export function undo(history: HistoryState): HistoryState {
  if (history.past.length === 0) {
    return history
  }

  const previous = history.past[history.past.length - 1]

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo(history: HistoryState): HistoryState {
  if (history.future.length === 0) {
    return history
  }

  const [next, ...rest] = history.future

  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  }
}
