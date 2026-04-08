import type { ImportCodecProbe, SupportedImportFormat } from '@trimmr/shared'
import { detectImportFormat } from './exportPure'

const WEBM_EBML = [0x1a, 0x45, 0xdf, 0xa3]

/** Matroska CodecID strings we care about for preflight (longest first to match first). */
const WEBM_CODEC_ID_MARKERS = [
  'V_MPEG4/ISO/AVC',
  'A_OPUS',
  'A_VORBIS',
  'V_VP9',
  'V_VP8',
  'V_AV1',
  'A_AAC',
  'A_PCM',
] as const

const MP4_CONTAINER_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
  'udta',
  'meta',
  'ilst',
])

function readU32(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] ?? 0) << 24) |
    ((buf[offset + 1] ?? 0) << 16) |
    ((buf[offset + 2] ?? 0) << 8) |
    (buf[offset + 3] ?? 0)
  )
}

function readFourcc(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(
    buf[offset] ?? 0,
    buf[offset + 1] ?? 0,
    buf[offset + 2] ?? 0,
    buf[offset + 3] ?? 0,
  )
}

export function isLikelyWebmContainer(head: Uint8Array): boolean {
  return (
    head.length >= 4 &&
    head[0] === WEBM_EBML[0] &&
    head[1] === WEBM_EBML[1] &&
    head[2] === WEBM_EBML[2] &&
    head[3] === WEBM_EBML[3]
  )
}

export function isLikelyMp4Container(head: Uint8Array): boolean {
  if (head.length < 12) {
    return false
  }
  const size = readU32(head, 0)
  const type = readFourcc(head, 4)
  if (type === 'ftyp') {
    return size >= 8
  }
  // Some tools emit small leading garbage; scan first 64 bytes for ftyp.
  const limit = Math.min(64, head.length - 8)
  for (let i = 0; i <= limit; i += 1) {
    if (readFourcc(head, i + 4) === 'ftyp') {
      return true
    }
  }
  return false
}

function indexOfUtf8(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || needle.length > haystack.length) {
    return -1
  }
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        continue outer
      }
    }
    return i
  }
  return -1
}

const textEncoder = new TextEncoder()

export function scanWebmCodecIds(head: Uint8Array): string[] {
  const found = new Set<string>()
  for (const id of WEBM_CODEC_ID_MARKERS) {
    const needle = textEncoder.encode(id)
    if (indexOfUtf8(head, needle) >= 0) {
      found.add(id)
    }
  }
  return [...found]
}

export function parseMp4FtypAndStsd(buf: Uint8Array): {
  majorBrand: string | undefined
  sampleEntryTypes: string[]
} {
  const sampleEntryTypes: string[] = []
  const state = { majorBrand: undefined as string | undefined }

  function walk(offset: number, end: number): void {
    let o = offset
    while (o + 8 <= end) {
      let size = readU32(buf, o)
      const type = readFourcc(buf, o + 4)
      let header = 8
      if (size === 1) {
        if (o + 16 > end) {
          break
        }
        const hi = readU32(buf, o + 8)
        const lo = readU32(buf, o + 12)
        size = hi * 0x1_0000_0000 + lo
        header = 16
      }
      if (size === 0) {
        size = end - o
      }
      if (size < header || o + size > end) {
        break
      }
      const boxEnd = o + size
      const contentStart = o + header
      if (type === 'ftyp' && contentStart + 4 <= boxEnd) {
        state.majorBrand = readFourcc(buf, contentStart)
      }
      if (type === 'stsd' && contentStart + 8 <= boxEnd) {
        const entryCount = readU32(buf, contentStart + 4)
        let p = contentStart + 8
        for (let i = 0; i < entryCount && p + 8 <= boxEnd; i += 1) {
          const entrySize = readU32(buf, p)
          const entryType = readFourcc(buf, p + 4)
          if (entrySize < 8 || p + entrySize > boxEnd) {
            break
          }
          sampleEntryTypes.push(entryType)
          p += entrySize
        }
      }
      if (MP4_CONTAINER_TYPES.has(type) && contentStart < boxEnd) {
        walk(contentStart, boxEnd)
      }
      o = boxEnd
    }
  }

  walk(0, buf.length)
  return { majorBrand: state.majorBrand, sampleEntryTypes }
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  if (typeof Response !== 'undefined') {
    return new Uint8Array(await new Response(blob).arrayBuffer())
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve(new Uint8Array(reader.result as ArrayBuffer))
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error('FileReader failed'))
      }
      reader.readAsArrayBuffer(blob)
    })
  }
  throw new Error('Unable to read file bytes for codec probe')
}

async function readBytesForProbe(file: File): Promise<{ head: Uint8Array; mp4Parse: Uint8Array }> {
  const maxFull = 4 * 1024 * 1024
  if (file.size <= maxFull) {
    const buf = await blobToUint8Array(file)
    return { head: buf, mp4Parse: buf }
  }
  const headN = 512 * 1024
  const tailN = 2 * 1024 * 1024
  const head = await blobToUint8Array(file.slice(0, headN))
  const tail = await blobToUint8Array(file.slice(Math.max(0, file.size - tailN)))
  const merged = new Uint8Array(head.length + tail.length)
  merged.set(head, 0)
  merged.set(tail, head.length)
  return { head, mp4Parse: merged }
}

function sniffedContainerFromHead(head: Uint8Array): SupportedImportFormat {
  if (isLikelyWebmContainer(head)) {
    return 'webm'
  }
  if (isLikelyMp4Container(head)) {
    return 'mp4'
  }
  return 'unknown'
}

/**
 * Byte-level probe for import preflight (container + codec hints). Safe to run on any file size;
 * reads at most ~4MB for small files, otherwise head + tail windows.
 */
export async function probeImportCodecFromFile(file: File): Promise<ImportCodecProbe> {
  const { head, mp4Parse } = await readBytesForProbe(file)
  const sniffedContainer = sniffedContainerFromHead(head)

  if (sniffedContainer === 'webm') {
    return {
      sniffedContainer,
      webmCodecIds: scanWebmCodecIds(head),
    }
  }

  if (sniffedContainer === 'mp4') {
    const { majorBrand, sampleEntryTypes } = parseMp4FtypAndStsd(mp4Parse)
    return {
      sniffedContainer,
      mp4MajorBrand: majorBrand,
      mp4SampleEntryTypes: sampleEntryTypes.length > 0 ? sampleEntryTypes : undefined,
    }
  }

  return { sniffedContainer: 'unknown' }
}

export function resolveImportFormat(
  mimeType: string,
  fileName: string,
  probe: ImportCodecProbe,
): SupportedImportFormat {
  const fromMime = detectImportFormat(mimeType, fileName)
  if (probe.sniffedContainer === 'webm' || probe.sniffedContainer === 'mp4') {
    if (fromMime === 'unknown' || fromMime !== probe.sniffedContainer) {
      return probe.sniffedContainer
    }
  }
  return fromMime
}

export function resolveIsVideoImport(
  mimeType: string,
  fileName: string,
  format: SupportedImportFormat,
  probe: ImportCodecProbe,
): boolean {
  if (mimeType.startsWith('video/')) {
    return true
  }
  if (probe.sniffedContainer === 'webm' || probe.sniffedContainer === 'mp4') {
    return true
  }
  if (format === 'webm' || format === 'mp4') {
    return true
  }
  const lower = fileName.toLowerCase()
  return lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.m4v')
}

export function resolveIsAnimatedImageImport(
  mimeType: string,
  fileName: string,
  format: SupportedImportFormat,
  probe: ImportCodecProbe,
): boolean {
  if (resolveIsVideoImport(mimeType, fileName, format, probe)) {
    return false
  }
  if (mimeType.startsWith('image/')) {
    return true
  }
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.apng') ||
    lower.endsWith('.png')
  )
}

export function refineVideoMimeType(mimeType: string, format: SupportedImportFormat): string {
  if (format === 'webm') {
    return 'video/webm'
  }
  if (format === 'mp4') {
    return 'video/mp4'
  }
  return mimeType || 'application/octet-stream'
}
