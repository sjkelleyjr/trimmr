import { decompressFrames, parseGIF } from 'gifuct-js'

export type GifFrameSource = ImageBitmap | HTMLCanvasElement

export function disposeGifFrameCache(frames: GifFrameSource[]) {
  for (const frame of frames) {
    if (frame instanceof ImageBitmap) {
      frame.close()
    }
  }
}

interface GifFrameCache {
  frames: GifFrameSource[]
  cumulativeDurationsMs: number[]
  totalDurationMs: number
}

async function snapshotCanvas(canvas: HTMLCanvasElement): Promise<GifFrameSource> {
  const clone = document.createElement('canvas')
  clone.width = canvas.width
  clone.height = canvas.height
  const context = clone.getContext('2d')
  if (context) {
    context.drawImage(canvas, 0, 0)
  }
  return clone
}

export async function buildGifFrameCacheFromBytes(bytes: ArrayBuffer): Promise<GifFrameCache | null> {
  try {
    const parsed = parseGIF(bytes) as {
      lsd?: { width?: number; height?: number; backgroundColorIndex?: number }
      gct?: number[][]
    }
    const width = parsed.lsd?.width ?? 0
    const height = parsed.lsd?.height ?? 0
    if (width < 1 || height < 1) {
      return null
    }

    const decoded = decompressFrames(parsed as never, true) as Array<{
      delay?: number
      patch?: Uint8ClampedArray
      disposalType?: number
      dims?: { left: number; top: number; width: number; height: number }
    }>
    if (decoded.length === 0) {
      return null
    }

    const backgroundColor = (() => {
      const index = parsed.lsd?.backgroundColorIndex
      const palette = parsed.gct
      if (typeof index !== 'number' || !Array.isArray(palette)) {
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      const color = palette[index]
      if (!Array.isArray(color) || color.length < 3) {
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      return { r: color[0] ?? 0, g: color[1] ?? 0, b: color[2] ?? 0, a: 255 }
    })()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }

    let totalDurationMs = 0
    const cumulativeDurationsMs: number[] = []
    const frames: GifFrameSource[] = []
    const patchCanvas = document.createElement('canvas')
    const patchContext = patchCanvas.getContext('2d')
    if (!patchContext) {
      return null
    }

    for (const frame of decoded) {
      const before = frame.disposalType === 3 ? context.getImageData(0, 0, width, height) : null
      const dims = frame.dims
      const patch = frame.patch
      if (dims && patch) {
        patchCanvas.width = dims.width
        patchCanvas.height = dims.height
        patchContext.clearRect(0, 0, dims.width, dims.height)
        const patchData = new Uint8ClampedArray(patch)
        patchContext.putImageData(new ImageData(patchData, dims.width, dims.height), 0, 0)
        // Use source-over alpha compositing so transparent patch pixels preserve existing frame content.
        context.drawImage(patchCanvas, dims.left, dims.top)
      }

      frames.push(await snapshotCanvas(canvas))

      const delayMs = Math.max(16, Math.round(frame.delay ?? 100))
      totalDurationMs += delayMs
      cumulativeDurationsMs.push(totalDurationMs)

      if (frame.disposalType === 2 && dims) {
        context.fillStyle = `rgba(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b}, ${backgroundColor.a / 255})`
        context.fillRect(dims.left, dims.top, dims.width, dims.height)
      } else if (frame.disposalType === 3) {
        if (before) {
          context.putImageData(before, 0, 0)
        }
      }
    }

    if (frames.length === 0 || totalDurationMs <= 0) {
      disposeGifFrameCache(frames)
      return null
    }

    return {
      frames,
      cumulativeDurationsMs,
      totalDurationMs: Math.max(1, totalDurationMs),
    }
  } catch {
    return null
  }
}
