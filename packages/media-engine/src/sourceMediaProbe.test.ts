import { describe, expect, it } from 'vitest'
import { detectAnimatedImageDurationMs, detectAudioTrackStatus } from './sourceMediaProbe'

describe('detectAudioTrackStatus', () => {
  it('returns unknown when no engine-specific audio signals exist', () => {
    expect(detectAudioTrackStatus({} as HTMLVideoElement)).toBe('unknown')
  })
})

describe('detectAnimatedImageDurationMs', () => {
  it('returns fallback when file has empty type', async () => {
    const file = new File([], 'x.gif', { type: '' })
    expect(await detectAnimatedImageDurationMs(file, 3000)).toBe(3000)
  })
})
