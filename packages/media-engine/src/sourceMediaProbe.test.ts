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

  it('parses gif duration from bytes when the file type is missing', async () => {
    const gifBytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
      0x21, 0xf9, 0x04, 0x00, 0xbc, 0x02, 0x00, 0x00,
      0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0x02, 0x02, 0x44, 0x01, 0x00,
      0x3b,
    ])
    const file = new File([gifBytes], 'bitconnect.gif', { type: '' })
    expect(await detectAnimatedImageDurationMs(file, 3000)).toBe(7000)
  })
})
