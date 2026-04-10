import { clipDurationMs, clamp, outputDurationMs, sourceTimeToOutputTimeMs } from '@trimmr/shared'
import type { EditorProject } from '@trimmr/shared'

const DEFAULT_OVERLAY_FONT_FAMILY = 'Inter, system-ui, sans-serif'
const DEFAULT_OVERLAY_BACKGROUND_OPACITY = 0.45

export function mapOutputTimeToSourceTime(project: EditorProject, outputTimeMs: number) {
  if (!project.clip) {
    return 0
  }

  const boundedOutputTime = clamp(outputTimeMs, 0, outputDurationMs(project.clip))
  return project.clip.trimStartMs + boundedOutputTime * project.clip.playbackRate
}

export function mapSourceTimeToOutputTime(project: EditorProject, sourceTimeMs: number) {
  if (!project.clip) {
    return 0
  }

  return sourceTimeToOutputTimeMs(project.clip, sourceTimeMs)
}

export function syncCanvasSize(canvas: HTMLCanvasElement, project: EditorProject) {
  if (
    canvas.width !== project.exportPreset.width ||
    canvas.height !== project.exportPreset.height
  ) {
    canvas.width = project.exportPreset.width
    canvas.height = project.exportPreset.height
  }
}

/** CSS `aspect-ratio` for the preview so letterboxing matches `drawCover` on the export canvas. */
export function exportAspectRatioCss(preset: { width: number; height: number }): string {
  return `${preset.width} / ${preset.height}`
}

export async function seekVideo(video: HTMLVideoElement, timeMs: number) {
  if (video.readyState < 1) {
    await new Promise<void>((resolve, reject) => {
      const handleMetadata = () => {
        cleanup()
        resolve()
      }

      const handleError = () => {
        cleanup()
        reject(new Error('Video metadata failed to load'))
      }

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', handleMetadata)
        video.removeEventListener('error', handleError)
      }

      video.addEventListener('loadedmetadata', handleMetadata, { once: true })
      video.addEventListener('error', handleError, { once: true })
    })
  }

  const targetSeconds = Math.max(0, timeMs / 1000)

  if (Math.abs(video.currentTime - targetSeconds) < 0.04) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }

    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })
    video.currentTime = targetSeconds
  })
}

export async function drawProjectFrame({
  canvas,
  project,
  sourceVideo,
  sourceImage,
  sourceImageFrame,
  outputTimeMs,
  seek = true,
  renderOverlay = true,
}: {
  canvas: HTMLCanvasElement
  project: EditorProject
  sourceVideo: HTMLVideoElement | null
  sourceImage: HTMLImageElement | null
  sourceImageFrame?: CanvasImageSource | null
  outputTimeMs: number
  seek?: boolean
  renderOverlay?: boolean
}) {
  syncCanvasSize(canvas, project)

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context unavailable')
  }

  context.fillStyle = '#09090b'
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (project.source?.kind === 'video' && sourceVideo && project.clip) {
    if (seek) {
      await seekVideo(sourceVideo, mapOutputTimeToSourceTime(project, outputTimeMs))
    }
    drawCover(context, sourceVideo, canvas.width, canvas.height)
  }

  if (project.source?.kind === 'animated-image') {
    const frame = sourceImageFrame ?? null
    const img = sourceImage
    const frameIsVideo =
      typeof VideoFrame !== 'undefined' && frame !== null && frame instanceof VideoFrame
    if (frame && img && frameIsVideo) {
      try {
        drawCover(context, frame, canvas.width, canvas.height)
      } catch {
        drawCover(context, img, canvas.width, canvas.height)
      }
    } else if (frame) {
      drawCover(context, frame, canvas.width, canvas.height)
    } else if (img) {
      drawCover(context, img, canvas.width, canvas.height)
    }
  }

  if (renderOverlay) {
    for (const overlay of project.overlays) {
      drawOverlay(
        context,
        canvas.width,
        canvas.height,
        overlay.text,
        overlay.x,
        overlay.y,
        overlay.fontSize,
        overlay.fontFamily,
        overlay.color,
        overlay.backgroundOpacity,
      )
    }
  }
}

function canvasSourceDimensions(
  source: CanvasImageSource,
  fallbackW: number,
  fallbackH: number,
): { w: number; h: number } {
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    const w = source.displayWidth
    const h = source.displayHeight
    if (w > 0 && h > 0) {
      return { w, h }
    }
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    const w = source.width
    const h = source.height
    if (w > 0 && h > 0) {
      return { w, h }
    }
  }
  if (source instanceof HTMLCanvasElement) {
    if (source.width > 0 && source.height > 0) {
      return { w: source.width, h: source.height }
    }
  }
  if ('videoWidth' in source) {
    const video = source as HTMLVideoElement
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return { w: video.videoWidth, h: video.videoHeight }
    }
  }
  if ('naturalWidth' in source) {
    const image = source as HTMLImageElement
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      return { w: image.naturalWidth, h: image.naturalHeight }
    }
  }
  return { w: fallbackW, h: fallbackH }
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
) {
  const { w: sourceWidth, h: sourceHeight } = canvasSourceDimensions(source, targetWidth, targetHeight)
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight)
  const targetAspect = targetWidth / targetHeight

  let drawWidth = targetWidth
  let drawHeight = targetHeight
  let drawX = 0
  let drawY = 0

  if (sourceAspect > targetAspect) {
    drawHeight = targetWidth / sourceAspect
    drawY = (targetHeight - drawHeight) / 2
  } else {
    drawWidth = targetHeight * sourceAspect
    drawX = (targetWidth - drawWidth) / 2
  }

  context.drawImage(source, drawX, drawY, drawWidth, drawHeight)
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  color: string,
  backgroundOpacity: number,
) {
  if (!text.trim()) {
    return
  }

  const px = width * x
  const py = height * y
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `700 ${fontSize}px ${fontFamily || DEFAULT_OVERLAY_FONT_FAMILY}`
  const metrics = context.measureText(text)
  const paddingX = 18
  const paddingY = 12
  const boxWidth = metrics.width + paddingX * 2
  const boxHeight = fontSize + paddingY * 2
  const resolvedBackgroundOpacity = Number.isFinite(backgroundOpacity)
    ? clamp(backgroundOpacity, 0, 1)
    : DEFAULT_OVERLAY_BACKGROUND_OPACITY
  context.fillStyle = `rgba(0, 0, 0, ${resolvedBackgroundOpacity})`
  context.beginPath()
  context.roundRect(px - boxWidth / 2, py - boxHeight / 2, boxWidth, boxHeight, 16)
  context.fill()
  context.fillStyle = color
  context.fillText(text, px, py)
}

export function projectReadableDuration(project: EditorProject) {
  if (!project.clip) {
    return 0
  }

  return Math.round(outputDurationMs(project.clip))
}

export function clipReadableDuration(project: EditorProject) {
  if (!project.clip) {
    return 0
  }

  return clipDurationMs(project.clip)
}
