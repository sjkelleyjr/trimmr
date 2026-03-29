import { createId } from '@looplab/shared'
import type {
  EditorProject,
  ExportFormat,
  ExportPreset,
  SourceMedia,
  SupportedImportFormat,
} from '@looplab/shared'

const DB_NAME = 'looplab'
const STORE_NAME = 'drafts'
const LATEST_DRAFT_KEY = 'latest'
const LATEST_SOURCE_BLOB_KEY = 'latest-source-blob'

export interface MediaExportResult {
  blob: Blob
  filename: string
  mimeType: string
  requestedFormat: ExportFormat
  outputFormat: ExportFormat
}

export interface ExportProgress {
  phase: 'render' | 'transcode' | 'finalize'
  fraction: number
}

interface ExportTarget {
  requestedFormat: ExportFormat
  outputFormat: ExportFormat
  outputMimeType: string
  recorderMimeType: string
  extension: string
}

interface RecorderTarget {
  outputFormat: ExportFormat
  outputMimeType: string
  recorderMimeType: string
  extension: string
}

const MIME_TYPE_BY_EXPORT_FORMAT: Record<ExportFormat, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  gif: 'image/gif',
  'animated-webp': 'image/webp',
}

/** Matches apps/web dependency @ffmpeg/core; ESM build required (module worker uses dynamic import). CDN keeps Pages deploys under asset size limits. */
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

let ffmpegSingletonPromise: Promise<{
  ffmpeg: {
    load: (options: { coreURL: string; wasmURL: string; workerURL?: string }) => Promise<boolean>
    on: (event: 'progress', callback: (event: { progress: number }) => void) => void
    off: (event: 'progress', callback: (event: { progress: number }) => void) => void
    writeFile: (path: string, data: Uint8Array) => Promise<void>
    exec: (args: string[]) => Promise<number>
    readFile: (path: string) => Promise<Uint8Array | ArrayBuffer>
    deleteFile: (path: string) => Promise<void>
  }
  fetchFile: (file?: string | Blob | File) => Promise<Uint8Array>
}> | null = null

async function loadFfmpeg() {
  if (!ffmpegSingletonPromise) {
    ffmpegSingletonPromise = (async () => {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])

      const ffmpeg = new FFmpeg() as unknown as {
        load: (options: { coreURL: string; wasmURL: string; workerURL?: string }) => Promise<boolean>
        on: (event: 'progress', callback: (event: { progress: number }) => void) => void
        off: (event: 'progress', callback: (event: { progress: number }) => void) => void
        writeFile: (path: string, data: Uint8Array) => Promise<void>
        exec: (args: string[]) => Promise<number>
        readFile: (path: string) => Promise<Uint8Array | ArrayBuffer>
        deleteFile: (path: string) => Promise<void>
      }
      try {
        const env = (import.meta as ImportMeta & { env?: { VITE_FFMPEG_CORE_BASE?: string } }).env
        const overrideBase = env?.VITE_FFMPEG_CORE_BASE?.replace(/\/$/, '')
        const useLocal =
          import.meta.env.DEV &&
          (!overrideBase || overrideBase === '' || overrideBase === 'local')
        const coreBase =
          overrideBase && overrideBase !== 'local'
            ? overrideBase
            : useLocal
              ? null
              : FFMPEG_CORE_CDN_BASE
        const coreSrc = useLocal ? '/ffmpeg/ffmpeg-core.js' : `${coreBase}/ffmpeg-core.js`
        const wasmSrc = useLocal ? '/ffmpeg/ffmpeg-core.wasm' : `${coreBase}/ffmpeg-core.wasm`
        const coreURL = await toBlobURL(coreSrc, 'text/javascript')
        const wasmURL = await toBlobURL(wasmSrc, 'application/wasm')
        await ffmpeg.load({ coreURL, wasmURL })
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        throw new Error(`Failed to load ffmpeg core assets for browser transcoding. ${detail}`)
      }

      return { ffmpeg, fetchFile }
    })()
  }

  return ffmpegSingletonPromise
}

function buildTranscodeArgs(
  outputFormat: ExportFormat,
  inputFilename: string,
  outputFilename: string,
  fps: number,
) {
  if (outputFormat === 'mp4') {
    return ['-i', inputFilename, '-movflags', '+faststart', outputFilename]
  }

  if (outputFormat === 'gif') {
    const targetFps = Math.max(8, Math.min(30, Math.round(fps)))
    return ['-i', inputFilename, '-vf', `fps=${targetFps}`, '-loop', '0', outputFilename]
  }

  if (outputFormat === 'animated-webp') {
    return ['-i', inputFilename, '-loop', '0', outputFilename]
  }

  return ['-i', inputFilename, outputFilename]
}

async function transcodeBlob({
  inputBlob,
  inputExtension,
  outputFormat,
  fps,
  onProgress,
}: {
  inputBlob: Blob
  inputExtension: string
  outputFormat: ExportFormat
  fps: number
  onProgress?: (progress: ExportProgress) => void
}) {
  const { ffmpeg, fetchFile } = await loadFfmpeg()
  const outputExtension = outputFormat === 'animated-webp' ? 'webp' : outputFormat
  const inputFilename = `input.${inputExtension}`
  const outputFilename = `output.${outputExtension}`

  try {
    await ffmpeg.writeFile(inputFilename, await fetchFile(inputBlob))
    const args = buildTranscodeArgs(outputFormat, inputFilename, outputFilename, fps)
    const handleProgress = (event: { progress: number }) => {
      onProgress?.({
        phase: 'transcode',
        fraction: Math.min(1, Math.max(0, event.progress)),
      })
    }
    ffmpeg.on('progress', handleProgress)
    let exitCode = -1
    try {
      exitCode = await ffmpeg.exec(args)
    } finally {
      ffmpeg.off('progress', handleProgress)
    }

    if (exitCode !== 0) {
      throw new Error(`Failed to transcode export to ${outputFormat.toUpperCase()}.`)
    }

    const outputData = await ffmpeg.readFile(outputFilename)
    const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
    const normalized = new Uint8Array(bytes.byteLength)
    normalized.set(bytes)

    return {
      blob: new Blob([normalized.buffer], { type: MIME_TYPE_BY_EXPORT_FORMAT[outputFormat] }),
      extension: outputExtension,
      mimeType: MIME_TYPE_BY_EXPORT_FORMAT[outputFormat],
    }
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputFilename), ffmpeg.deleteFile(outputFilename)])
  }
}

function resolveExportTarget(requestedFormat: ExportFormat, hasAudio: boolean): ExportTarget {
  const supportsMimeType = (mimeType: string) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mimeType)

  const webmRecorderMimeType = hasAudio
    ? supportsMimeType('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : supportsMimeType('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
    : supportsMimeType('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'

  const recorderTarget: RecorderTarget = {
    outputFormat: 'webm',
    outputMimeType: 'video/webm',
    recorderMimeType: webmRecorderMimeType,
    extension: 'webm',
  }

  if (requestedFormat === 'mp4') {
    const mp4RecorderMimeType = supportsMimeType('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
      ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
      : supportsMimeType('video/mp4')
        ? 'video/mp4'
        : null

    if (mp4RecorderMimeType) {
      recorderTarget.outputFormat = 'mp4'
      recorderTarget.outputMimeType = 'video/mp4'
      recorderTarget.recorderMimeType = mp4RecorderMimeType
      recorderTarget.extension = 'mp4'
    }
  }

  return {
    requestedFormat,
    outputFormat: recorderTarget.outputFormat,
    outputMimeType: recorderTarget.outputMimeType,
    recorderMimeType: recorderTarget.recorderMimeType,
    extension: recorderTarget.extension,
  }
}

async function finalizeExport({
  chunks,
  exportTarget,
  fps,
  onProgress,
}: {
  chunks: BlobPart[]
  exportTarget: ExportTarget
  fps: number
  onProgress?: (progress: ExportProgress) => void
}): Promise<MediaExportResult> {
  const recordedBlob = new Blob(chunks, { type: exportTarget.outputMimeType })

  if (exportTarget.requestedFormat !== exportTarget.outputFormat) {
    try {
      const transcoded = await transcodeBlob({
        inputBlob: recordedBlob,
        inputExtension: exportTarget.extension,
        outputFormat: exportTarget.requestedFormat,
        fps,
        onProgress,
      })

      return {
        blob: transcoded.blob,
        filename: `looplab-export-${Date.now()}.${transcoded.extension}`,
        mimeType: transcoded.mimeType,
        requestedFormat: exportTarget.requestedFormat,
        outputFormat: exportTarget.requestedFormat,
      }
    } catch (error) {
      console.error('Looplab export transcode failed; falling back to WebM output.', error)
      return {
        blob: recordedBlob,
        filename: `looplab-export-${Date.now()}.${exportTarget.extension}`,
        mimeType: exportTarget.outputMimeType,
        requestedFormat: exportTarget.requestedFormat,
        outputFormat: exportTarget.outputFormat,
      }
    }
  }

  return {
    blob: recordedBlob,
    filename: `looplab-export-${Date.now()}.${exportTarget.extension}`,
    mimeType: exportTarget.outputMimeType,
    requestedFormat: exportTarget.requestedFormat,
    outputFormat: exportTarget.outputFormat,
  }
}

function detectFormat(file: File): SupportedImportFormat {
  if (file.type === 'video/mp4') return 'mp4'
  if (file.type === 'video/webm') return 'webm'
  if (file.type === 'image/gif') return 'gif'
  if (file.type === 'image/webp') return 'animated-webp'
  if (file.type === 'image/apng') return 'apng'
  if (file.name.toLowerCase().endsWith('.apng')) return 'apng'
  return 'unknown'
}

function estimateBitrateKbps(fileSizeBytes: number, durationMs: number) {
  if (durationMs <= 0) {
    return 0
  }

  return Math.max(1, Math.round((fileSizeBytes * 8) / (durationMs / 1000) / 1000))
}

function detectAudioTrackStatus(video: HTMLVideoElement): SourceMedia['audioTrackStatus'] {
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

async function detectAnimatedImageDurationMs(file: File, fallbackMs: number) {
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

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function serializeSourceBlob(source: SourceMedia | null) {
  if (!source || !source.objectUrl.startsWith('blob:') || typeof fetch !== 'function') {
    return null
  }

  try {
    const response = await fetch(source.objectUrl)
    if (!response.ok) {
      return null
    }

    return await response.blob()
  } catch {
    return null
  }
}

export async function saveDraft(project: EditorProject) {
  const db = await openDraftDb()
  const sourceBlob = await serializeSourceBlob(project.source)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put(project, LATEST_DRAFT_KEY)
    if (sourceBlob) {
      store.put(sourceBlob, LATEST_SOURCE_BLOB_KEY)
    } else {
      store.delete(LATEST_SOURCE_BLOB_KEY)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })

  db.close()
}

export async function loadDraft() {
  const db = await openDraftDb()
  const { project, sourceBlob } = await new Promise<{
    project: EditorProject | null
    sourceBlob: Blob | null
  }>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const projectRequest = store.get(LATEST_DRAFT_KEY)
    const sourceBlobRequest = store.get(LATEST_SOURCE_BLOB_KEY)
    let completed = 0

    const maybeResolve = () => {
      completed += 1
      if (completed === 2) {
        resolve({
          project: (projectRequest.result as EditorProject | undefined) ?? null,
          sourceBlob: (sourceBlobRequest.result as Blob | undefined) ?? null,
        })
      }
    }

    projectRequest.onsuccess = maybeResolve
    sourceBlobRequest.onsuccess = maybeResolve
    projectRequest.onerror = () => reject(projectRequest.error)
    sourceBlobRequest.onerror = () => reject(sourceBlobRequest.error)
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()

  if (!project) {
    return null
  }

  if (!project.source || !sourceBlob) {
    return project
  }

  return {
    ...project,
    source: {
      ...project.source,
      objectUrl: URL.createObjectURL(sourceBlob),
    },
  }
}

export async function extractSourceMedia(file: File): Promise<SourceMedia> {
  const format = detectFormat(file)
  const objectUrl = URL.createObjectURL(file)

  if (file.type.startsWith('video/')) {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = objectUrl

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Unable to load video metadata'))
    })

    return {
      id: createId('source'),
      name: file.name,
      objectUrl,
      mimeType: file.type,
      kind: 'video',
      format,
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Math.max(1000, Math.round(video.duration * 1000)),
      fileSizeBytes: file.size,
      estimatedBitrateKbps: estimateBitrateKbps(file.size, Math.round(video.duration * 1000)),
      audioTrackStatus: detectAudioTrackStatus(video),
    }
  }

  const image = new Image()
  image.src = objectUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Unable to load image metadata'))
  })
  const animatedDurationMs = await detectAnimatedImageDurationMs(file, 3000)

  return {
    id: createId('source'),
    name: file.name,
    objectUrl,
    mimeType: file.type || 'application/octet-stream',
    kind: 'animated-image',
    format,
    width: image.naturalWidth,
    height: image.naturalHeight,
    durationMs: animatedDurationMs,
    fileSizeBytes: file.size,
    estimatedBitrateKbps: estimateBitrateKbps(file.size, animatedDurationMs),
    audioTrackStatus: 'absent',
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function waitForVideoMetadata(video: HTMLVideoElement) {
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

function waitForSeek(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Unable to seek export video'))
    }

    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

function captureElementStream(video: HTMLVideoElement) {
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

function createAdjustedAudioStream(sourceStream: MediaStream | null, gain: number) {
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

export async function exportPreviewToWebM({
  canvas,
  drawFrame,
  durationMs,
  preset,
  onProgress,
}: {
  canvas: HTMLCanvasElement
  drawFrame: (timeMs: number) => Promise<void> | void
  durationMs: number
  preset: ExportPreset
  onProgress?: (progress: ExportProgress) => void
}): Promise<MediaExportResult> {
  const exportTarget = resolveExportTarget(preset.format, false)
  const stream = canvas.captureStream(preset.fps)
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, { mimeType: exportTarget.recorderMimeType })
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  recorder.start()

  const frameDurationMs = 1000 / preset.fps
  const safeDurationMs = Math.max(frameDurationMs, durationMs)
  for (let timeMs = 0; timeMs < durationMs; timeMs += frameDurationMs) {
    await drawFrame(timeMs)
    await wait(frameDurationMs)
    onProgress?.({
      phase: 'render',
      fraction: Math.min(1, Math.max(0, (timeMs + frameDurationMs) / safeDurationMs)),
    })
  }

  recorder.stop()

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  return finalizeExport({
    chunks,
    exportTarget,
    fps: preset.fps,
    onProgress,
  })
}

export async function exportVideoProjectToWebM({
  canvas,
  sourceUrl,
  trimStartMs,
  trimEndMs,
  playbackRate,
  exportVolumeGain = 1,
  preset,
  renderFrame,
  onProgress,
}: {
  canvas: HTMLCanvasElement
  sourceUrl: string
  trimStartMs: number
  trimEndMs: number
  playbackRate: number
  exportVolumeGain?: number
  preset: ExportPreset
  renderFrame: (video: HTMLVideoElement) => Promise<void> | void
  onProgress?: (progress: ExportProgress) => void
}): Promise<MediaExportResult> {
  const video = document.createElement('video')
  video.src = sourceUrl
  video.preload = 'auto'
  video.playsInline = true
  video.muted = true

  await waitForVideoMetadata(video)
  video.currentTime = trimStartMs / 1000
  await waitForSeek(video)
  video.playbackRate = playbackRate

  const canvasStream = canvas.captureStream(preset.fps)
  const combinedStream = new MediaStream()
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track)
  }

  const sourceStream = captureElementStream(video)
  const adjustedAudio = createAdjustedAudioStream(sourceStream, exportVolumeGain)
  for (const track of adjustedAudio.stream?.getAudioTracks() ?? []) {
    combinedStream.addTrack(track)
  }

  const chunks: BlobPart[] = []
  const exportTarget = resolveExportTarget(preset.format, (sourceStream?.getAudioTracks()?.length ?? 0) > 0)
  const recorder = new MediaRecorder(combinedStream, { mimeType: exportTarget.recorderMimeType })
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start()
  await renderFrame(video)

  const stopExport = () => {
    if (recorder.state !== 'inactive') {
      recorder.stop()
    }
    video.pause()
    sourceStream?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
    adjustedAudio.cleanup()
    canvasStream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
  }

  await video.play()

  const videoDurationMs =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.round(video.duration * 1000)
      : trimEndMs
  const exportEndMs = Math.min(trimEndMs, videoDurationMs)

  if (exportEndMs <= trimStartMs) {
    await renderFrame(video)
    stopExport()
    await stopped
    return finalizeExport({
      chunks,
      exportTarget,
      fps: preset.fps,
      onProgress,
    })
  }

  await new Promise<void>((resolve) => {
    const step = async () => {
      if (video.currentTime * 1000 >= exportEndMs) {
        stopExport()
        resolve()
        return
      }

      await renderFrame(video)
      const trimDuration = Math.max(1, exportEndMs - trimStartMs)
      onProgress?.({
        phase: 'render',
        fraction: Math.min(1, Math.max(0, (video.currentTime * 1000 - trimStartMs) / trimDuration)),
      })
      requestAnimationFrame(() => {
        void step()
      })
    }

    void step()
  })

  await stopped

  return finalizeExport({
    chunks,
    exportTarget,
    fps: preset.fps,
    onProgress,
  })
}

export function downloadBlob(result: MediaExportResult) {
  const objectUrl = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = result.filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export function createProjectSummary(project: EditorProject) {
  return {
    source: project.source?.name ?? null,
    durationMs: project.clip ? project.clip.trimEndMs - project.clip.trimStartMs : 0,
    playbackRate: project.clip?.playbackRate ?? 1,
    exportFormat: project.exportPreset.format,
  }
}

export function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${(fileSizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
