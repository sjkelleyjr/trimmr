import { describe, expect, it } from 'vitest'

import { ensureVideoBlobMimeType } from './ensureVideoBlobMimeType'

describe('ensureVideoBlobMimeType', () => {
  it('returns the same blob when type is already set', () => {
    const b = new Blob([new Uint8Array([1, 2])], { type: 'video/webm' })
    expect(ensureVideoBlobMimeType(b, 'a.webm', 'video/mp4')).toBe(b)
  })

  it('wraps untyped blobs in a File with the given MIME', () => {
    const b = new Blob([new Uint8Array([1, 2])])
    const out = ensureVideoBlobMimeType(b, 'clip.mp4', 'video/mp4')
    expect(out).not.toBe(b)
    expect(out.type).toBe('video/mp4')
    expect(out.size).toBe(b.size)
  })

  it('wraps application/octet-stream blobs', () => {
    const b = new Blob([new Uint8Array([1])], { type: 'application/octet-stream' })
    const out = ensureVideoBlobMimeType(b, 'x.webm', 'video/webm')
    expect(out.type).toBe('video/webm')
  })
})
