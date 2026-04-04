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

export async function detectAnimatedImageDurationMs(
  file: File,
  fallbackMs: number,
): Promise<number> {
  if (typeof ImageDecoder === 'undefined' || !file.type) {
    return fallbackMs
  }

  try {
    const supported = await ImageDecoder.isTypeSupported(file.type)
    if (!supported) {
      return fallbackMs
    }

    const bytes = await file.arrayBuffer()
    const decoder = new ImageDecoder({
      type: file.type,
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
