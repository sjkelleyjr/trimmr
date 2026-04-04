import { webmRecorderMimeCandidates } from './exportResolve'

/** WebKit/Safari often omit `dataavailable` chunks unless a timeslice is set. */
export const EXPORT_RECORDER_TIMESLICE_MS = 250

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function mimeTypeSupportedByRecorder(mime: string): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mime)
  )
}

/**
 * WebKit often rejects VP9+Opus or hangs with empty chunks; try VP8 and plain webm.
 */
export function createMediaRecorder(stream: MediaStream, preferredMimeType: string): MediaRecorder {
  for (const mime of webmRecorderMimeCandidates(preferredMimeType)) {
    if (!mimeTypeSupportedByRecorder(mime)) {
      continue
    }
    try {
      return new MediaRecorder(stream, { mimeType: mime })
    } catch {
      continue
    }
  }
  try {
    return new MediaRecorder(stream)
  } catch (error) {
    throw new Error(
      `Could not create MediaRecorder: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Safari/iOS may not advance playback on a detached export `<video>`. */
export function mountExportVideoInDocument(video: HTMLVideoElement): () => void {
  if (typeof document === 'undefined' || !(video instanceof Node)) {
    return () => {}
  }

  const shell = document.createElement('div')
  shell.setAttribute('data-trimmr-export-video', '')
  shell.setAttribute('aria-hidden', 'true')
  shell.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;overflow:hidden;z-index:-1'
  if (typeof video.setAttribute === 'function') {
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
  }
  video.playsInline = true
  video.style.width = '2px'
  video.style.height = '2px'
  shell.appendChild(video)
  document.body.appendChild(shell)
  return () => {
    shell.remove()
  }
}

export function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const handleLoadedMetadata = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Unable to load export video metadata'))
    }

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

/**
 * Seek and wait for the frame to be ready. Listeners must be registered **before**
 * assigning `currentTime`, or `seeked` may fire synchronously and be missed (WebKit).
 *
 * Some WebKit builds leave `seeking === true` or omit `seeked` during capture/export;
 * we poll `seeking` and use a hard timeout so export cannot hang indefinitely.
 */
export function seekVideoToTime(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let pollId: number | undefined
    let timeoutId: number | undefined

    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve()
    }

    const handleError = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(new Error('Unable to seek export video'))
    }

    const cleanup = () => {
      if (pollId !== undefined) {
        window.clearInterval(pollId)
        pollId = undefined
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        timeoutId = undefined
      }
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }

    const handleSeeked = () => finish()

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })

    video.currentTime = seconds

    queueMicrotask(() => {
      if (!video.seeking) {
        finish()
      }
    })

    pollId = window.setInterval(() => {
      if (!video.seeking) {
        finish()
      }
    }, 32)

    timeoutId = window.setTimeout(() => {
      finish()
    }, 500)
  })
}

export function captureElementStream(video: HTMLVideoElement): MediaStream | null {
  const captureVideo = video as HTMLVideoElement & {
    captureStream?: () => MediaStream
    mozCaptureStream?: () => MediaStream
  }

  if (typeof captureVideo.captureStream === 'function') {
    return captureVideo.captureStream()
  }

  if (typeof captureVideo.mozCaptureStream === 'function') {
    return captureVideo.mozCaptureStream()
  }

  return null
}

export function createAdjustedAudioStream(sourceStream: MediaStream | null, gain: number) {
  const audioTracks = sourceStream?.getAudioTracks() ?? []
  if (audioTracks.length === 0) {
    return {
      stream: null as MediaStream | null,
      cleanup: () => {},
    }
  }

  const normalizedGain = Math.max(0, gain)
  if (normalizedGain === 1 || typeof AudioContext === 'undefined') {
    return {
      stream: sourceStream,
      cleanup: () => {},
    }
  }

  try {
    const audioContext = new AudioContext()
    const sourceNode = audioContext.createMediaStreamSource(sourceStream!)
    const gainNode = audioContext.createGain()
    const destination = audioContext.createMediaStreamDestination()

    gainNode.gain.value = normalizedGain
    sourceNode.connect(gainNode)
    gainNode.connect(destination)

    return {
      stream: destination.stream,
      cleanup: () => {
        sourceNode.disconnect()
        gainNode.disconnect()
        if (audioContext.state !== 'closed') {
          void audioContext.close()
        }
      },
    }
  } catch {
    return {
      stream: sourceStream,
      cleanup: () => {},
    }
  }
}
