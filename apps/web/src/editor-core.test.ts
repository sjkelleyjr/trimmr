import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  commit,
  createEmptyProject,
  createHistory,
  createProjectFromSource,
  editorProjectsEqual,
  redo,
  undo,
} from '@trimmr/editor-core'
import { createProject, createSourceMedia } from './test/factories'

describe('editor timeline model', () => {
  it('normalizes a source into a single clip project', () => {
    const history = createHistory(createEmptyProject())
    const next = commit(history, {
      type: 'set-source',
      source: createSourceMedia(),
    })

    expect(next.present.source?.name).toBe('clip.mp4')
    expect(next.present.clip?.trimStartMs).toBe(0)
    expect(next.present.clip?.trimEndMs).toBe(8_000)
    expect(next.present.overlays[0]?.text).toBe('')
  })

  it('keeps trim values bounded and ordered', () => {
    const withSource = commit(createHistory(createEmptyProject()), {
      type: 'set-source',
      source: createSourceMedia({
        id: 'source-2',
        name: 'loop.webm',
        mimeType: 'video/webm',
        format: 'webm',
        width: 720,
        height: 720,
        durationMs: 5_000,
      }),
    })

    const trimmed = commit(withSource, {
      type: 'set-trim',
      trimStartMs: 4_900,
      trimEndMs: 2_000,
    })

    expect(trimmed.present.clip?.trimStartMs).toBe(4_900)
    expect(trimmed.present.clip?.trimEndMs).toBe(5_000)
  })

  it('hydrates a saved project and clamps editing commands', () => {
    const project = createProject()
    const overlayId = project.overlays[0]!.id
    const hydrated = applyCommand(createEmptyProject(), { type: 'hydrate', project })
    const moved = applyCommand(hydrated, { type: 'set-overlay-position', overlayId, x: -1, y: 2 })
    const resized = applyCommand(moved, { type: 'set-export-size', width: 99, height: 5000 })
    const resizedOverlay = applyCommand(resized, {
      type: 'set-overlay-font-size',
      overlayId,
      fontSize: 999,
    })
    const spedUp = applyCommand(resizedOverlay, { type: 'set-playback-rate', playbackRate: 9 })

    expect(spedUp.overlays[0]).toMatchObject({ x: 0.05, y: 0.95 })
    expect(spedUp.overlays[0]?.fontSize).toBe(999)
    expect(spedUp.exportPreset.width).toBe(240)
    expect(spedUp.exportPreset.height).toBe(1920)
    expect(spedUp.clip?.playbackRate).toBe(3)
  })

  it('hydrates legacy overlay styles with safe defaults', () => {
    const project = createProject()
    const legacyOverlay = {
      id: project.overlays[0]!.id,
      text: project.overlays[0]!.text,
      x: project.overlays[0]!.x,
      y: project.overlays[0]!.y,
      fontSize: project.overlays[0]!.fontSize,
      color: project.overlays[0]!.color,
      background: 'rgba(0, 0, 0, 0.25)',
    }
    const legacyProject = {
      ...project,
      overlays: [legacyOverlay],
    } as unknown as typeof project

    const hydrated = applyCommand(createEmptyProject(), { type: 'hydrate', project: legacyProject })

    expect(hydrated.overlays[0]).toMatchObject({
      fontFamily: 'Inter, system-ui, sans-serif',
      backgroundOpacity: 0.25,
    })
  })

  it('hydrates legacy overlays when background is missing, non-string, or unparsable', () => {
    const project = createProject()
    const base = {
      id: project.overlays[0]!.id,
      text: project.overlays[0]!.text,
      x: project.overlays[0]!.x,
      y: project.overlays[0]!.y,
      fontSize: project.overlays[0]!.fontSize,
      color: project.overlays[0]!.color,
    }

    const missingBackground = applyCommand(createEmptyProject(), {
      type: 'hydrate',
      project: { ...project, overlays: [{ ...base }] } as unknown as typeof project,
    })
    expect(missingBackground.overlays[0]?.backgroundOpacity).toBe(0.45)

    const numericBackground = applyCommand(createEmptyProject(), {
      type: 'hydrate',
      project: {
        ...project,
        overlays: [{ ...base, background: 1 }],
      } as unknown as typeof project,
    })
    expect(numericBackground.overlays[0]?.backgroundOpacity).toBe(0.45)

    const opaqueString = applyCommand(createEmptyProject(), {
      type: 'hydrate',
      project: {
        ...project,
        overlays: [{ ...base, background: 'solid red' }],
      } as unknown as typeof project,
    })
    expect(opaqueString.overlays[0]?.backgroundOpacity).toBe(0.45)

    const badAlpha = applyCommand(createEmptyProject(), {
      type: 'hydrate',
      project: {
        ...project,
        overlays: [{ ...base, background: 'rgba(1, 2, 3, 0.5.6)' }],
      } as unknown as typeof project,
    })
    expect(badAlpha.overlays[0]?.backgroundOpacity).toBe(0.45)
  })

  it('fills in default font family when an overlay omits fontFamily on hydrate', () => {
    const project = createProject()
    const overlay = { ...project.overlays[0]! }
    delete (overlay as { fontFamily?: string }).fontFamily
    const hydrated = applyCommand(createEmptyProject(), {
      type: 'hydrate',
      project: { ...project, overlays: [overlay] },
    })

    expect(hydrated.overlays[0]?.fontFamily).toBe('Inter, system-ui, sans-serif')
  })

  it('updates overlay text and export format', () => {
    const project = createProjectFromSource(createSourceMedia())
    const next = applyCommand(project, {
      type: 'set-overlay-text',
      overlayId: project.overlays[0]!.id,
      text: 'Hello OSS',
    })
    const exported = applyCommand(next, { type: 'set-export-format', format: 'gif' })

    expect(exported.overlays[0]?.text).toBe('Hello OSS')
    expect(exported.exportPreset.format).toBe('gif')
  })

  it('falls back to default export dimensions when source dimensions are missing', () => {
    const project = createProjectFromSource(
      createSourceMedia({
        width: 0,
        height: 0,
      }),
    )

    expect(project.exportPreset.width).toBe(720)
    expect(project.exportPreset.height).toBe(720)
  })

  it('returns the original project when editing before a source exists', () => {
    const empty = createEmptyProject()
    const next = applyCommand(empty, {
      type: 'set-playback-rate',
      playbackRate: 1.5,
    })

    expect(next).toBe(empty)
  })

  it('preserves history identity when a command makes no effective change', () => {
    const history = createHistory(createProject())
    const next = commit(history, {
      type: 'set-overlay-text',
      overlayId: history.present.overlays[0]!.id,
      text: history.present.overlays[0]?.text ?? '',
    })

    expect(next).toBe(history)
  })

  it('compares projects with editorProjectsEqual (structural, not reference)', () => {
    const a = createProject()
    const b = structuredClone(a)
    expect(editorProjectsEqual(a, b)).toBe(true)
    const c = structuredClone(a)
    c.overlays[0]!.text = 'changed'
    expect(editorProjectsEqual(a, c)).toBe(false)
  })

  it('editorProjectsEqual is false when overlay lists differ in length or shape', () => {
    const base = createProject()
    const extraOverlay = structuredClone(base)
    extraOverlay.overlays.push({
      id: 'second',
      text: 'b',
      x: 0.5,
      y: 0.5,
      fontSize: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#fff',
      backgroundOpacity: 0.5,
    })
    expect(editorProjectsEqual(base, extraOverlay)).toBe(false)

    const overlaysAsDict = {
      ...base,
      overlays: { 0: base.overlays[0] } as unknown as typeof base.overlays,
    }
    expect(editorProjectsEqual(base, overlaysAsDict as typeof base)).toBe(false)
  })

  it('editorProjectsEqual is false when one project has an extra top-level key', () => {
    const base = createProject()
    const withExtra = { ...base, __extra: true } as typeof base & { __extra: boolean }
    expect(editorProjectsEqual(base, withExtra as typeof base)).toBe(false)
  })

  it('returns the original project for no-op trim, playback, position, size, and format updates', () => {
    const project = createProject()

    expect(
      applyCommand(project, {
        type: 'set-trim',
        trimStartMs: project.clip!.trimStartMs,
        trimEndMs: project.clip!.trimEndMs,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-playback-rate',
        playbackRate: project.clip!.playbackRate,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-overlay-position',
        overlayId: project.overlays[0]!.id,
        x: project.overlays[0]!.x,
        y: project.overlays[0]!.y,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-overlay-font-size',
        overlayId: project.overlays[0]!.id,
        fontSize: project.overlays[0]!.fontSize,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-overlay-style',
        overlayId: project.overlays[0]!.id,
        color: project.overlays[0]!.color,
        fontFamily: project.overlays[0]!.fontFamily,
        backgroundOpacity: project.overlays[0]!.backgroundOpacity,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-export-size',
        width: project.exportPreset.width,
        height: project.exportPreset.height,
      }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-export-format',
        format: project.exportPreset.format,
      }),
    ).toBe(project)
  })

  it('supports undo and redo across committed edits', () => {
    const initial = createHistory(createProject())
    const updated = commit(initial, {
      type: 'set-overlay-text',
      overlayId: initial.present.overlays[0]!.id,
      text: 'Version one',
    })
    const reverted = undo(updated)
    const replayed = redo(reverted)

    expect(updated.present.overlays[0]?.text).toBe('Version one')
    expect(reverted.present.overlays[0]?.text).toBe('')
    expect(replayed.present.overlays[0]?.text).toBe('Version one')
  })

  it('adds overlays and updates them by id', () => {
    const project = createProject()
    const added = applyCommand(project, {
      type: 'add-overlay',
      text: 'Second line',
      x: 0.25,
      y: 0.35,
      fontSize: 42,
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: '#00ffaa',
      backgroundOpacity: 0.2,
    })
    const overlayId = added.overlays[1]!.id
    const updated = applyCommand(added, {
      type: 'set-overlay-text',
      overlayId,
      text: 'Updated second line',
    })

    expect(added.overlays).toHaveLength(2)
    expect(updated.overlays[1]).toMatchObject({
      id: overlayId,
      text: 'Updated second line',
      x: 0.25,
      y: 0.35,
      fontSize: 42,
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: '#00ffaa',
      backgroundOpacity: 0.2,
    })
  })

  it('deletes overlays by id', () => {
    const project = createProject()
    const added = applyCommand(project, { type: 'add-overlay', text: 'Delete me', x: 0.25, y: 0.35 })
    const overlayId = added.overlays[1]!.id
    const deleted = applyCommand(added, { type: 'delete-overlay', overlayId })

    expect(deleted.overlays).toHaveLength(1)
    expect(deleted.overlays.some((overlay) => overlay.id === overlayId)).toBe(false)
  })

  it('returns the same project when delete targets a missing overlay id', () => {
    const project = createProject()
    const next = applyCommand(project, { type: 'delete-overlay', overlayId: 'missing-overlay' })

    expect(next).toBe(project)
  })

  it('returns the same project when updates target a missing overlay id', () => {
    const project = createProject()
    const missing = 'missing-overlay'

    expect(
      applyCommand(project, { type: 'set-overlay-text', overlayId: missing, text: 'Nope' }),
    ).toBe(project)

    expect(
      applyCommand(project, { type: 'set-overlay-position', overlayId: missing, x: 0.5, y: 0.5 }),
    ).toBe(project)

    expect(
      applyCommand(project, { type: 'set-overlay-font-size', overlayId: missing, fontSize: 48 }),
    ).toBe(project)

    expect(
      applyCommand(project, {
        type: 'set-overlay-style',
        overlayId: missing,
        color: '#000000',
      }),
    ).toBe(project)
  })

  it('updates overlay font size by id', () => {
    const project = createProject()
    const overlayId = project.overlays[0]!.id
    const resized = applyCommand(project, {
      type: 'set-overlay-font-size',
      overlayId,
      fontSize: 36,
    })

    expect(resized.overlays[0]?.fontSize).toBe(36)
  })

  it('updates overlay style by id', () => {
    const project = createProject()
    const overlayId = project.overlays[0]!.id
    const styled = applyCommand(project, {
      type: 'set-overlay-style',
      overlayId,
      color: '#ff00aa',
      fontFamily: 'Georgia, "Times New Roman", serif',
      backgroundOpacity: 0.2,
    })

    expect(styled.overlays[0]).toMatchObject({
      color: '#ff00aa',
      fontFamily: 'Georgia, "Times New Roman", serif',
      backgroundOpacity: 0.2,
    })
  })

  it('leaves undo and redo unchanged when history stacks are empty', () => {
    const history = createHistory(createProject())
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })
})
