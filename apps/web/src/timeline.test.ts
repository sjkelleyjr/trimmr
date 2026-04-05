import { describe, expect, it } from 'vitest'
import {
  clamp,
  clipDurationMs,
  createId,
  formatDuration,
  formatPreciseDuration,
  lastSourceFrameTimeMs,
  outputDurationMs,
  projectDurationMs,
  sourceTimeToOutputTimeMs,
  timelineSnapshot,
} from '@trimmr/shared'
import { createProject } from './test/factories'

describe('shared timeline helpers', () => {
  it('clamps values inside the expected range', () => {
    expect(clamp(20, 0, 10)).toBe(10)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('creates readable ids and durations', () => {
    expect(createId('clip')).toMatch(/^clip-/)
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(61_000)).toBe('1:01')
    expect(formatDuration(-100)).toBe('0:00')
    expect(formatPreciseDuration(0)).toBe('0:00.000')
    expect(formatPreciseDuration(61_234)).toBe('1:01.234')
    expect(formatPreciseDuration(-100)).toBe('0:00.000')
  })

  it('computes clip and project durations', () => {
    const project = createProject()
    expect(clipDurationMs(project.clip!)).toBe(8_000)
    expect(outputDurationMs(project.clip!)).toBe(8_000)
    expect(projectDurationMs(project)).toBe(8_000)
  })

  it('does not round output duration down to zero for a non-empty trim', () => {
    const project = createProject()
    project.clip!.trimStartMs = 0
    project.clip!.trimEndMs = 1
    project.clip!.playbackRate = 100
    expect(clipDurationMs(project.clip!)).toBe(1)
    expect(outputDurationMs(project.clip!)).toBe(1)
  })

  it('returns zero output duration when trim length is zero', () => {
    const project = createProject()
    project.clip!.trimStartMs = 3_000
    project.clip!.trimEndMs = 3_000
    expect(clipDurationMs(project.clip!)).toBe(0)
    expect(outputDurationMs(project.clip!)).toBe(0)
  })

  it('returns zero duration when there is no clip', () => {
    const project = createProject({ clip: null, source: null })
    expect(projectDurationMs(project)).toBe(0)
    expect(timelineSnapshot(project)).toEqual({
      durationMs: 0,
      visibleDurationMs: 0,
      startLabel: '0:00',
      endLabel: '0:00',
    })
  })

  it('builds a timeline snapshot from trimmed media', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1_000
    project.clip!.trimEndMs = 5_000
    project.clip!.playbackRate = 2

    expect(timelineSnapshot(project)).toEqual({
      durationMs: 8_000,
      visibleDurationMs: 2_000,
      startLabel: '0:00',
      endLabel: '0:02',
    })
  })

  it('maps source time back into output time', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1_000
    project.clip!.trimEndMs = 5_000
    project.clip!.playbackRate = 2

    expect(sourceTimeToOutputTimeMs(project.clip!, 1_500)).toBe(250)
    expect(sourceTimeToOutputTimeMs(project.clip!, 10_000)).toBe(2_000)
    expect(sourceTimeToOutputTimeMs(project.clip!, 500)).toBe(0)
  })

  it('returns the last displayable source frame near trim end', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1_000
    project.clip!.trimEndMs = 5_000

    expect(lastSourceFrameTimeMs(project.clip!)).toBe(4_966)
    expect(lastSourceFrameTimeMs(project.clip!, 10_000)).toBe(1_000)
  })
})
