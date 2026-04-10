import { createId } from '@trimmr/shared'
import type {
  EditorProject,
  ExportFormat,
  ExportPreset,
  SourceMedia,
  SupportedImportFormat,
} from '@trimmr/shared'
import {
  buildTranscodeArgs,
  detectImportFormat,
  estimateBitrateKbps,
  ffmpegTranscodeProgressFraction,
  formatExportFilename,
  MIME_TYPE_BY_EXPORT_FORMAT,
  outputExtensionForTranscode,
  playbackRenderProgressFraction,
  previewRenderProgressFraction,
  seekBasedRenderProgressFraction,
} from './exportPure'
import { isWebKitExportUserAgent, resolveExportTarget } from './exportResolve'
import type { ExportTarget } from './exportResolve'
import {
  captureElementStream,
  createAdjustedAudioStream,
  createMediaRecorder,
  EXPORT_RECORDER_TIMESLICE_MS,
  flushCompositedFrame,
  mimeTypeSupportedByRecorder,
  mountExportVideoInDocument,
  seekVideoToTime,
  wait,
  waitForVideoMetadata,
} from './exportVideoDom'
import { loadFfmpeg } from './ffmpegLoader'
import type { LoadedFfmpeg } from './ffmpegLoader'
import {
  extractMp4VideoPresentationMetadata,
  probeImportCodecFromFile,
  readFileBytesForCodecProbe,
  refineVideoMimeType,
  resolveImportFormat,
  resolveIsVideoImport,
} from './importCodecProbe'
import { detectAnimatedImageDurationMs, detectAudioTrackStatus } from './sourceMediaProbe'

export type { ExportTarget } from './exportResolve'

export { loadDraft, saveDraft } from './draftStorage'
export { loadFfmpeg } from './ffmpegLoader'

/** Cap source-import metadata waits so corrupt or undecodable files cannot hang the importer. */
const SOURCE_METADATA_LOAD_TIMEOUT_MS = 10_000

/** Race a DOM-event-driven `attach` callback against a hard timeout that rejects with `message`. */
function awaitWithMetadataTimeout(
  message: string,
  attach: (ok: () => void, fail: () => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error(message))
    const id = window.setTimeout(fail, SOURCE_METADATA_LOAD_TIMEOUT_MS)
    attach(
      () => { window.clearTimeout(id); resolve() },
      () => { window.clearTimeout(id); fail() },
    )
  })
}

/**
 * Convert an animated image (GIF/WebP/APNG) to WebM so video preview/seek/expoer works
 */
async function convertAnimatedImageToWebmViaFfmpeg(
  file: File,
  format: SupportedImportFormat,
): Promise<{ blob: Blob; durationMs: number; width: number; height: number } | null> {
  const inputName =
    format === 'gif' ? 'in.gif'
      : format === 'animated-webp' ? 'in.webp'
        : format === 'apng' ? 'in.png'
          : null
  if (!inputName) {
    return null
  }

  let loaded: LoadedFfmpeg
  try {
    loaded = await loadFfmpeg()
  } catch {
    return null
  }
  const { ffmpeg, fetchFile } = loaded

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libvpx',
      '-b:v', '1M',
      '-an',
      'out.webm',
    ])
    if (exitCode !== 0) {
      return null
    }

    const outputData = await ffmpeg.readFile('out.webm')
    const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
    const normalized = new Uint8Array(bytes.byteLength)
    normalized.set(bytes)
    const blob = new Blob([normalized.buffer], { type: 'video/webm' })

    const url = URL.createObjectURL(blob)
    try {
      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.muted = true
      probe.src = url
      await awaitWithMetadataTimeout('Unable to load video metadata', (ok, fail) => {
        probe.onloadedmetadata = ok
        probe.onerror = fail
      })
      const durationMs = Math.round(probe.duration * 1000)
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return null
      }
      return { blob, durationMs, width: probe.videoWidth, height: probe.videoHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  } finally {
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile('out.webm'),
    ])
  }
}

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
  const outputExtension = outputExtensionForTranscode(outputFormat)
  const inputFilename = `input.${inputExtension}`
  const outputFilename = `output.${outputExtension}`

  try {
    await ffmpeg.writeFile(inputFilename, await fetchFile(inputBlob))
    const args = ['-threads', '1', ...buildTranscodeArgs(outputFormat, inputFilename, outputFilename, fps)]
    const handleProgress = (event: { progress: number }) => {
      onProgress?.({
        phase: 'transcode',
        fraction: ffmpegTranscodeProgressFraction(event.progress),
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

async function finalizeExport({
  chunks,
  exportTarget,
  fps,
  onProgress,
  recordedMimeType,
}: {
  chunks: BlobPart[]
  exportTarget: ExportTarget
  fps: number
  onProgress?: (progress: ExportProgress) => void
  /** Actual `MediaRecorder.mimeType` when codecs fall back (e.g. VP8 on WebKit). */
  recordedMimeType?: string
}): Promise<MediaExportResult> {
  const blobMime =
    recordedMimeType && recordedMimeType.length > 0 ? recordedMimeType : exportTarget.outputMimeType
  const recordedBlob = new Blob(chunks, { type: blobMime })

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
        filename: formatExportFilename(Date.now(), transcoded.extension),
        mimeType: transcoded.mimeType,
        requestedFormat: exportTarget.requestedFormat,
        outputFormat: exportTarget.requestedFormat,
      }
    } catch (error) {
      console.error('trimmr export transcode failed; falling back to WebM output.', error)
      return {
        blob: recordedBlob,
        filename: formatExportFilename(Date.now(), exportTarget.extension),
        mimeType: blobMime,
        requestedFormat: exportTarget.requestedFormat,
        outputFormat: exportTarget.outputFormat,
      }
    }
  }

  return {
    blob: recordedBlob,
    filename: formatExportFilename(Date.now(), exportTarget.extension),
    mimeType: blobMime,
    requestedFormat: exportTarget.requestedFormat,
    outputFormat: exportTarget.outputFormat,
  }
}

export { isWebKitExportUserAgent } from './exportResolve'
export {
  isLikelyMp4Container,
  isLikelyWebmContainer,
  extractMp4VideoPresentationMetadata,
  parseMp4FtypAndStsd,
  probeImportCodecFromFile,
  readFileBytesForCodecProbe,
  refineVideoMimeType,
  resolveImportFormat,
  resolveIsAnimatedImageImport,
  resolveIsVideoImport,
  scanWebmCodecIds,
} from './importCodecProbe'

export async function extractSourceMedia(file: File): Promise<SourceMedia> {
  const probe = await probeImportCodecFromFile(file)
  const format = resolveImportFormat(file.type, file.name, probe)
  const objectUrl = URL.createObjectURL(file)

  if (resolveIsVideoImport(file.type, file.name, format, probe)) {
    const videoMime = refineVideoMimeType(file.type || '', format)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    // Blob URL works across Chromium/WebKit for decodable files. When the element still errors
    // (e.g. AV1-in-MP4 on Safari), MP4 container metadata is read below.
    video.src = objectUrl

    let width: number
    let height: number
    let rawDurationMs: number
    let audioTrackStatus: SourceMedia['audioTrackStatus']

    try {
      await awaitWithMetadataTimeout('Unable to load video metadata', (ok, fail) => {
        video.onloadedmetadata = ok
        video.onerror = fail
      })
      width = video.videoWidth
      height = video.videoHeight
      rawDurationMs = Math.round(video.duration * 1000)
      audioTrackStatus = detectAudioTrackStatus(video)
    } catch {
      let fallback: ReturnType<typeof extractMp4VideoPresentationMetadata> = null
      if (format === 'mp4') {
        const bytes = await readFileBytesForCodecProbe(file)
        fallback = extractMp4VideoPresentationMetadata(bytes)
      }
      if (!fallback) {
        throw new Error('Unable to load video metadata')
      }
      width = fallback.width
      height = fallback.height
      rawDurationMs = fallback.durationMs
      audioTrackStatus = 'unknown'
    }

    const durationMs = Math.max(1000, rawDurationMs)

    return {
      id: createId('source'),
      name: file.name,
      objectUrl,
      mimeType: videoMime,
      kind: 'video',
      format,
      width,
      height,
      durationMs,
      fileSizeBytes: file.size,
      estimatedBitrateKbps: estimateBitrateKbps(file.size, durationMs),
      audioTrackStatus,
      videoSrcBlob: file,
      importCodecProbe: probe,
    }
  }

  // Browsers without `ImageDecoder` (Firefox/Safari) can't extract per-frame
  // bitmaps from an animated image, so the seek/preview/export pipeline can't
  // address individual frames. Convert to WebM via ffmpeg and route the result
  // through the standard video path. Falls through on any failure.
  if (typeof ImageDecoder === 'undefined') {
    const converted = await convertAnimatedImageToWebmViaFfmpeg(file, format)
    if (converted) {
      URL.revokeObjectURL(objectUrl)
      return {
        id: createId('source'),
        name: file.name,
        objectUrl: URL.createObjectURL(converted.blob),
        mimeType: 'video/webm',
        kind: 'video',
        format: 'webm',
        width: converted.width,
        height: converted.height,
        durationMs: converted.durationMs,
        fileSizeBytes: converted.blob.size,
        estimatedBitrateKbps: estimateBitrateKbps(converted.blob.size, converted.durationMs),
        audioTrackStatus: 'absent',
        videoSrcBlob: converted.blob,
      }
    }
  }

  const image = new Image()
  image.src = objectUrl
  await awaitWithMetadataTimeout('Unable to load image metadata', (ok, fail) => {
    image.onload = ok
    image.onerror = fail
  })
  const animatedDurationMs = await detectAnimatedImageDurationMs(file, 3000)

  return {
    id: createId('source'),
    name: file.name,
    objectUrl,
    mimeType: file.type || 'application/octet-stream',
    kind: 'animated-image',
    format: detectImportFormat(file.type, file.name),
    width: image.naturalWidth,
    height: image.naturalHeight,
    durationMs: animatedDurationMs,
    fileSizeBytes: file.size,
    estimatedBitrateKbps: estimateBitrateKbps(file.size, animatedDurationMs),
    audioTrackStatus: 'absent',
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
  const exportTarget = resolveExportTarget(preset.format, false, mimeTypeSupportedByRecorder)
  const stream = canvas.captureStream(preset.fps)
  const chunks: BlobPart[] = []
  const recorder = createMediaRecorder(stream, exportTarget.recorderMimeType)
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  // Built before `start()` so a mid-recording failure rejects `await stopped` instead of hanging it.
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('MediaRecorder error'))
  })

  recorder.start(EXPORT_RECORDER_TIMESLICE_MS)

  const frameDurationMs = 1000 / preset.fps
  for (let timeMs = 0; timeMs < durationMs; timeMs += frameDurationMs) {
    await drawFrame(timeMs)
    await flushCompositedFrame()
    await wait(frameDurationMs)
    onProgress?.({
      phase: 'render',
      fraction: previewRenderProgressFraction(timeMs, frameDurationMs, durationMs),
    })
  }

  try {
    if (recorder.state === 'recording') {
      recorder.requestData()
    }
  } catch {
    /* requestData is optional in some engines */
  }

  recorder.stop()

  await stopped

  return finalizeExport({
    chunks,
    exportTarget,
    fps: preset.fps,
    onProgress,
    recordedMimeType:
      recorder.mimeType && recorder.mimeType.length > 0 ? recorder.mimeType : undefined,
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

  const unmountVideo = mountExportVideoInDocument(video)
  try {
    await waitForVideoMetadata(video)
    await seekVideoToTime(video, trimStartMs / 1000)
    video.playbackRate = playbackRate

    const canvasStream = canvas.captureStream(preset.fps)
    const combinedStream = new MediaStream()
    for (const track of canvasStream.getVideoTracks()) {
      combinedStream.addTrack(track)
    }

    const useSeekBasedWebKitExport =
      typeof navigator !== 'undefined' && isWebKitExportUserAgent(navigator.userAgent)
    let sourceStream: ReturnType<typeof captureElementStream> = null
    let adjustedAudio = createAdjustedAudioStream(null, exportVolumeGain)

    if (!useSeekBasedWebKitExport) {
      sourceStream = captureElementStream(video)
      adjustedAudio = createAdjustedAudioStream(sourceStream, exportVolumeGain)
      for (const track of adjustedAudio.stream?.getAudioTracks() ?? []) {
        combinedStream.addTrack(track)
      }
    }

    const chunks: BlobPart[] = []
    const exportTarget = resolveExportTarget(
      preset.format,
      !useSeekBasedWebKitExport && (sourceStream?.getAudioTracks()?.length ?? 0) > 0,
      mimeTypeSupportedByRecorder,
    )
    const recorder = createMediaRecorder(combinedStream, exportTarget.recorderMimeType)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    // `onerror` so a mid-recording failure rejects `await stopped` instead of hanging it.
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = () => reject(new Error('MediaRecorder error'))
    })

    recorder.start(EXPORT_RECORDER_TIMESLICE_MS)
    await renderFrame(video)

    const stopExport = () => {
      if (recorder.state !== 'inactive') {
        try {
          recorder.requestData()
        } catch {
          /* requestData is optional in older engines */
        }
        recorder.stop()
      }
      video.pause()
      sourceStream?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      adjustedAudio.cleanup()
      canvasStream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
    }

    const videoDurationMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : trimEndMs
    const exportEndMs = Math.min(trimEndMs, videoDurationMs)

    const recordedMimeType =
      recorder.mimeType && recorder.mimeType.length > 0 ? recorder.mimeType : undefined

    if (exportEndMs <= trimStartMs) {
      await renderFrame(video)
      stopExport()
      await stopped
      return finalizeExport({
        chunks,
        exportTarget,
        fps: preset.fps,
        onProgress,
        recordedMimeType,
      })
    }

    const trimDuration = Math.max(1, exportEndMs - trimStartMs)
    const frameDurationMs = 1000 / Math.max(1, preset.fps)

    if (useSeekBasedWebKitExport) {
      const frameDelayMs = Math.max(1, Math.round(frameDurationMs))
      for (let tMs = trimStartMs; tMs < exportEndMs; tMs += frameDurationMs) {
        await seekVideoToTime(video, tMs / 1000)
        await renderFrame(video)
        onProgress?.({
          phase: 'render',
          fraction: seekBasedRenderProgressFraction(
            tMs,
            frameDurationMs,
            trimStartMs,
            trimDuration,
          ),
        })
        // Wall-clock pacing so MediaRecorder + canvas.captureStream receive frames steadily (Safari).
        await wait(frameDelayMs)
      }
      stopExport()
    } else {
      await video.play()

      // Drive the export loop with a fixed timer instead of requestAnimationFrame.
      // Some environments throttle rAF during capture/export.
      const framePeriodMs = frameDurationMs
      await new Promise<void>((resolve, reject) => {
        let intervalId: number | undefined
        let busy = false

        const cleanupInterval = () => {
          if (intervalId !== undefined) {
            window.clearInterval(intervalId)
            intervalId = undefined
          }
        }

        const tick = async () => {
          try {
            if (video.currentTime * 1000 >= exportEndMs) {
              cleanupInterval()
              stopExport()
              resolve()
              return
            }
            if (busy) {
              return
            }
            busy = true
            await renderFrame(video)
            busy = false

            onProgress?.({
              phase: 'render',
              fraction: playbackRenderProgressFraction(
                video.currentTime * 1000,
                trimStartMs,
                trimDuration,
              ),
            })
          } catch (error) {
            cleanupInterval()
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        }

        intervalId = window.setInterval(() => {
          void tick()
        }, framePeriodMs)

        void tick()
      })
    }

    await stopped

    return finalizeExport({
      chunks,
      exportTarget,
      fps: preset.fps,
      onProgress,
      recordedMimeType,
    })
  } finally {
    unmountVideo()
  }
}

export function downloadBlob(result: MediaExportResult) {
  const viteEnv = (import.meta as ImportMeta & { env?: { VITE_PLAYWRIGHT_EXPORT_HOOK?: string } }).env
  if (viteEnv?.VITE_PLAYWRIGHT_EXPORT_HOOK === '1' && typeof window !== 'undefined') {
    const w = window as Window & {
      __PLAYWRIGHT_LAST_EXPORT?: { blob: Blob; filename: string }
    }
    w.__PLAYWRIGHT_LAST_EXPORT = { blob: result.blob, filename: result.filename }
  }

  const objectUrl = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = result.filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'

  const body = typeof document !== 'undefined' ? document.body : null
  if (body) {
    body.appendChild(anchor)
    try {
      anchor.click()
    } finally {
      window.setTimeout(() => {
        try {
          body.removeChild(anchor)
        } catch {
          /* ignore */
        }
        URL.revokeObjectURL(objectUrl)
      }, 1500)
    }
    return
  }

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
