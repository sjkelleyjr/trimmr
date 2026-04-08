import { describe, expect, it } from 'vitest'
import {
  isLikelyMp4Container,
  isLikelyWebmContainer,
  parseMp4FtypAndStsd,
  resolveImportFormat,
  resolveIsAnimatedImageImport,
  resolveIsVideoImport,
  scanWebmCodecIds,
} from './importCodecProbe'

describe('importCodecProbe', () => {
  it('detects WebM EBML magic', () => {
    const head = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01])
    expect(isLikelyWebmContainer(head)).toBe(true)
    expect(isLikelyMp4Container(head)).toBe(false)
  })

  it('detects MP4 ftyp', () => {
    const head = new Uint8Array(32)
    head.set([0, 0, 0, 32], 0)
    head.set([0x66, 0x74, 0x79, 0x70], 4) // ftyp
    head.set([0x69, 0x73, 0x6f, 0x6d], 8) // isom
    expect(isLikelyMp4Container(head)).toBe(true)
    expect(isLikelyWebmContainer(head)).toBe(false)
  })

  it('finds WebM CodecID markers', () => {
    const head = new Uint8Array(256)
    const enc = new TextEncoder()
    head.set(enc.encode('A_OPUS'), 100)
    head.set(enc.encode('V_VP9'), 150)
    expect(scanWebmCodecIds(head).sort()).toEqual(['A_OPUS', 'V_VP9'].sort())
  })

  it('parses ftyp brand and stsd sample types from a minimal MP4 buffer', () => {
    // Minimal moov > trak > mdia > minf > stbl > stsd with one avc1 entry (sizes are illustrative).
    const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
    const u32 = (n: number) =>
      new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])

    const stsdContent = new Uint8Array([
      0,
      0,
      0,
      0, // version + flags
      ...u32(1), // entry count
      ...u32(24), // entry size
      ...ascii('avc1'), // type
      ...new Uint8Array(16).fill(0), // padding / sample entry body
    ])

    const stblInner = new Uint8Array([
      ...u32(8 + stsdContent.length),
      ...ascii('stsd'),
      ...stsdContent,
    ])
    const minfInner = new Uint8Array([...u32(8 + stblInner.length), ...ascii('minf'), ...stblInner])
    const mdiaInner = new Uint8Array([...u32(8 + minfInner.length), ...ascii('mdia'), ...minfInner])
    const trakInner = new Uint8Array([...u32(8 + mdiaInner.length), ...ascii('trak'), ...mdiaInner])
    const moovInner = new Uint8Array([...u32(8 + trakInner.length), ...ascii('moov'), ...trakInner])

    const ftyp = new Uint8Array([
      ...u32(20),
      ...ascii('ftyp'),
      ...ascii('isom'),
      ...u32(0x200),
      ...ascii('mp41'),
    ])
    const buf = new Uint8Array([...ftyp, ...moovInner])

    const { majorBrand, sampleEntryTypes } = parseMp4FtypAndStsd(buf)
    expect(majorBrand).toBe('isom')
    expect(sampleEntryTypes).toContain('avc1')
  })

  it('resolveImportFormat prefers sniffed container when MIME is wrong', () => {
    const probe = { sniffedContainer: 'webm' as const, webmCodecIds: ['A_OPUS'] }
    expect(resolveImportFormat('video/mp4', 'x.webm', probe)).toBe('webm')
    expect(resolveImportFormat('', 'x.webm', probe)).toBe('webm')
  })

  it('resolveIsVideoImport treats sniffed MP4 as video even when MIME is octet-stream', () => {
    const probe = { sniffedContainer: 'mp4' as const, mp4MajorBrand: 'isom' }
    expect(resolveIsVideoImport('application/octet-stream', 'bin', 'unknown', probe)).toBe(true)
  })

  it('resolveIsAnimatedImageImport is false when bytes say video', () => {
    const probe = { sniffedContainer: 'webm' as const }
    expect(resolveIsAnimatedImageImport('image/gif', 'x.gif', 'webm', probe)).toBe(false)
  })
})
