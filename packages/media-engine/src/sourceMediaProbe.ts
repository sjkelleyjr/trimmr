import type { SourceMedia } from '@trimmr/shared'

export function detectAudioTrackStatus(video: HTMLVideoElement): SourceMedia['audioTrackStatus'] {
  const mediaWithAudioTracks = video as HTMLVideoElement & {
    audioTracks?: { length: number }
    mozHasAudio?: boolean
    webkitAudioDecodedByteCount?: number
    captureStream?: () => MediaStream
    mozCaptureStream?: () => MediaStream
  }

  if (typeof mediaWithAudioTracks.mozHasAudio === 'boolean') {
    // In some engines this can be false even when audio exists; avoid false negatives.
    return mediaWithAudioTracks.mozHasAudio ? 'present' : 'unknown'
  }

  if (typeof mediaWithAudioTracks.audioTracks?.length === 'number') {
    // Chromium frequently reports audioTracks.length = 0 even when audio is present.
    // Treat zero as unknown to avoid false "no audio" UI states.
    return mediaWithAudioTracks.audioTracks.length > 0 ? 'present' : 'unknown'
  }

  if (typeof mediaWithAudioTracks.webkitAudioDecodedByteCount === 'number') {
    return mediaWithAudioTracks.webkitAudioDecodedByteCount > 0 ? 'present' : 'unknown'
  }

  if (typeof mediaWithAudioTracks.captureStream === 'function') {
    try {
      const trackCount = mediaWithAudioTracks.captureStream().getAudioTracks().length
      return trackCount > 0 ? 'present' : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  if (typeof mediaWithAudioTracks.mozCaptureStream === 'function') {
    try {
      const trackCount = mediaWithAudioTracks.mozCaptureStream().getAudioTracks().length
      return trackCount > 0 ? 'present' : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  return 'unknown'
}

function inferredAnimatedMimeType(file: File): string {
  const explicit = file.type?.toLowerCase() ?? ''
  if (explicit) {
    return explicit
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.apng') || name.endsWith('.png')) return 'image/apng'
  return ''
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  const blob = file as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read animated image bytes'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }
      reject(new Error('Unexpected file reader result'))
    }
    reader.readAsArrayBuffer(file)
  })
}

function parseGifDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 13) return null
  const header = String.fromCharCode(
    bytes[0] ?? 0,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    bytes[3] ?? 0,
    bytes[4] ?? 0,
    bytes[5] ?? 0,
  )
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    return null
  }

  let offset = 6
  offset += 7
  const packed = bytes[10] ?? 0
  if ((packed & 0x80) !== 0) {
    offset += 3 * (1 << ((packed & 0x07) + 1))
  }

  let pendingDelayMs = 100
  let totalDurationMs = 0
  let frameCount = 0

  while (offset < bytes.length) {
    const introducer = bytes[offset++]
    if (introducer === 0x3b) break
    if (introducer === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9) {
        const blockSize = bytes[offset++] ?? 0
        if (blockSize < 4 || offset + blockSize > bytes.length) return null
        const delayCs = (bytes[offset + 1] ?? 0) | ((bytes[offset + 2] ?? 0) << 8)
        pendingDelayMs = Math.max(20, (delayCs > 0 ? delayCs : 10) * 10)
        offset += blockSize
        offset += 1
        continue
      }
      while (offset < bytes.length) {
        const size = bytes[offset++] ?? 0
        if (size === 0) break
        offset += size
      }
      continue
    }
    if (introducer === 0x2c) {
      if (offset + 9 > bytes.length) return null
      const imagePacked = bytes[offset + 8] ?? 0
      offset += 9
      if ((imagePacked & 0x80) !== 0) {
        offset += 3 * (1 << ((imagePacked & 0x07) + 1))
      }
      if (offset >= bytes.length) return null
      offset += 1
      while (offset < bytes.length) {
        const size = bytes[offset++] ?? 0
        if (size === 0) break
        offset += size
      }
      totalDurationMs += pendingDelayMs
      frameCount += 1
      pendingDelayMs = 100
      continue
    }
    return null
  }

  if (frameCount < 1) return null
  return Math.max(1000, totalDurationMs)
}

export async function detectAnimatedImageDurationMs(
  file: File,
  fallbackMs: number,
): Promise<number> {
  const mimeType = inferredAnimatedMimeType(file)
  const bytes = await readFileArrayBuffer(file)
  if (mimeType === 'image/gif') {
    const parsedGifDurationMs = parseGifDurationMs(new Uint8Array(bytes))
    if (parsedGifDurationMs !== null) {
      return parsedGifDurationMs
    }
  }

  if (typeof ImageDecoder === 'undefined' || !mimeType) {
    return fallbackMs
  }

  try {
    const supported = await ImageDecoder.isTypeSupported(mimeType)
    if (!supported) {
      return fallbackMs
    }

    const decoder = new ImageDecoder({
      type: mimeType,
      data: bytes,
      preferAnimation: true,
    })
    await decoder.tracks.ready
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0
    if (frameCount < 1) {
      decoder.close()
      return fallbackMs
    }

    let totalDurationMs = 0
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const decoded = await decoder.decode({ frameIndex, completeFramesOnly: true })
      // VideoFrame.duration is microseconds; default to 100ms when absent.
      totalDurationMs += Math.max(16, Math.round((decoded.image.duration ?? 100_000) / 1000))
      decoded.image.close()
    }
    decoder.close()

    return Math.max(1000, totalDurationMs)
  } catch {
    return fallbackMs
  }
}
