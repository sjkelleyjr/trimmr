import { describe, expect, it, vi } from 'vitest'
import {
  clipReadableDuration,
  drawProjectFrame,
  exportAspectRatioCss,
  mapOutputTimeToSourceTime,
  mapSourceTimeToOutputTime,
  projectReadableDuration,
  seekVideo,
  syncCanvasSize,
} from './lib/renderProjectFrame'
import { createProject } from './test/factories'

describe('renderProjectFrame helpers', () => {
  it('maps output time back to source time and clamps to clip bounds', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1000
    project.clip!.trimEndMs = 5000
    project.clip!.playbackRate = 2

    expect(mapOutputTimeToSourceTime(project, 250)).toBe(1500)
    expect(mapOutputTimeToSourceTime(project, 10_000)).toBe(5000)
    expect(mapOutputTimeToSourceTime({ ...project, clip: null }, 250)).toBe(0)
  })

  it('maps source time to output time using the active clip', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1000
    project.clip!.trimEndMs = 5000
    project.clip!.playbackRate = 2

    expect(mapSourceTimeToOutputTime(project, 2000)).toBe(500)
    expect(mapSourceTimeToOutputTime(project, 10_000)).toBe(2000)
    expect(mapSourceTimeToOutputTime({ ...project, clip: null }, 2000)).toBe(0)
  })

  it('keeps canvas dimensions in sync with the export preset', () => {
    const project = createProject()
    project.exportPreset.width = 960
    project.exportPreset.height = 540

    const canvas = document.createElement('canvas')
    syncCanvasSize(canvas, project)

    expect(canvas.width).toBe(960)
    expect(canvas.height).toBe(540)
  })

  it('exports a CSS aspect-ratio string aligned with the export preset', () => {
    expect(exportAspectRatioCss({ width: 720, height: 1280 })).toBe('720 / 1280')
    expect(exportAspectRatioCss({ width: 960, height: 540 })).toBe('960 / 540')
  })

  it('does not resize the canvas when dimensions already match the preset', () => {
    const project = createProject()
    project.exportPreset.width = 720
    project.exportPreset.height = 720

    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 720

    syncCanvasSize(canvas, project)

    expect(canvas.width).toBe(720)
    expect(canvas.height).toBe(720)
  })

  it('seeks video after metadata is available', async () => {
    const listeners = new Map<string, EventListener>()
    const video = {
      readyState: 0,
      currentTime: 0,
      addEventListener: vi.fn((name: string, handler: EventListener) => {
        listeners.set(name, handler)
      }),
      removeEventListener: vi.fn((name: string) => {
        listeners.delete(name)
      }),
    } as unknown as HTMLVideoElement

    const promise = seekVideo(video, 750)
    listeners.get('loadedmetadata')?.(new Event('loadedmetadata'))
    await Promise.resolve()
    listeners.get('seeked')?.(new Event('seeked'))
    await promise

    expect(video.currentTime).toBe(0.75)
  })

  it('skips seek work when the current time is already close enough', async () => {
    const video = {
      readyState: 1,
      currentTime: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    await seekVideo(video, 1010)

    expect(video.addEventListener).not.toHaveBeenCalled()
  })

  it('anchors overlay text at normalized x/y without vertical nudge', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.exportPreset.width = 100
    project.exportPreset.height = 100
    project.overlays[0]!.text = 'Hi'
    project.overlays[0]!.x = 0.5
    project.overlays[0]!.y = 0.5

    const image = {
      naturalWidth: 400,
      naturalHeight: 200,
    } as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 20 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: image,
      outputTimeMs: 0,
    })

    expect(context.fillText).toHaveBeenCalledWith('Hi', 50, 50)
  })

  it('draws image frames and overlays onto the canvas', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays[0]!.text = 'Overlay'
    const image = {
      naturalWidth: 400,
      naturalHeight: 200,
    } as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: image,
      outputTimeMs: 0,
    })

    expect(context.fillRect).toHaveBeenCalled()
    expect(context.drawImage).toHaveBeenCalled()
    expect(context.roundRect).toHaveBeenCalled()
    expect(context.fillText).toHaveBeenCalledWith(
      project.overlays[0]!.text,
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('handles portrait image sources and blank overlays', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays[0]!.text = '   '

    const image = {
      naturalWidth: 200,
      naturalHeight: 400,
    } as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: image,
      outputTimeMs: 0,
    })

    expect(context.drawImage).toHaveBeenCalled()
    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('draws video frames after seeking and rejects when no context is available', async () => {
    const project = createProject()
    const video = {
      readyState: 1,
      currentTime: 0,
      videoWidth: 1280,
      videoHeight: 720,
      addEventListener: vi.fn((name: string, handler: EventListener) => {
        if (name === 'seeked') {
          queueMicrotask(() => handler(new Event('seeked')))
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: video,
      sourceImage: null,
      outputTimeMs: 50,
    })

    await expect(
      drawProjectFrame({
        canvas: { ...canvas, getContext: () => null } as HTMLCanvasElement,
        project,
        sourceVideo: video,
        sourceImage: null,
        outputTimeMs: 50,
      }),
    ).rejects.toThrow('Canvas 2D context unavailable')
  })

  it('draws video frames without seeking when the caller already controls playback', async () => {
    const project = createProject()
    project.overlays = []

    const video = {
      readyState: 1,
      currentTime: 0.25,
      videoWidth: 1280,
      videoHeight: 720,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: video,
      sourceImage: null,
      outputTimeMs: 50,
      seek: false,
    })

    expect(video.addEventListener).not.toHaveBeenCalled()
    expect(context.drawImage).toHaveBeenCalled()
    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('skips drawing when an image source has no intrinsic size', async () => {
    // Previously `drawCover` stretched unsized sources to canvas dimensions,
    // which silently squashed `ImageBitmap`/`VideoFrame` inputs (no
    // `naturalWidth`/`videoWidth`). The resolver now returns null and we skip
    // the draw entirely — matching the sibling "no frame or image" behaviour.
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays = []

    const image = {} as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: image,
      outputTimeMs: 0,
    })

    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it('prefers sourceImageFrame over sourceImage for animated sources', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays = []

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = 80
    frameCanvas.height = 40

    const decoyImage = {
      naturalWidth: 999,
      naturalHeight: 999,
    } as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: decoyImage,
      sourceImageFrame: frameCanvas,
      outputTimeMs: 0,
    })

    expect(context.drawImage).toHaveBeenCalledWith(
      frameCanvas,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('skips drawing when an animated source has no frame or image', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays = []

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: null,
      outputTimeMs: 0,
    })

    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it('skips video drawing when the clip is missing', async () => {
    const project = createProject()
    const withoutClip = { ...project, clip: null }

    const video = {
      readyState: 1,
      currentTime: 0,
      videoWidth: 1280,
      videoHeight: 720,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project: withoutClip,
      sourceVideo: video,
      sourceImage: null,
      outputTimeMs: 50,
    })

    expect(video.addEventListener).not.toHaveBeenCalled()
    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it('omits overlays when renderOverlay is false', async () => {
    const project = createProject()
    project.overlays[0]!.text = 'Hidden'

    const video = {
      readyState: 1,
      currentTime: 0.25,
      videoWidth: 1280,
      videoHeight: 720,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: video,
      sourceImage: null,
      outputTimeMs: 50,
      seek: false,
      renderOverlay: false,
    })

    expect(context.roundRect).not.toHaveBeenCalled()
    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('uses default font and background when overlay style fields are empty or invalid', async () => {
    const project = createProject({
      source: {
        ...createProject().source!,
        kind: 'animated-image',
      },
    })
    project.overlays[0]!.text = 'Styled'
    project.overlays[0]!.fontFamily = ''
    project.overlays[0]!.backgroundOpacity = Number.NaN

    const image = {
      naturalWidth: 400,
      naturalHeight: 200,
    } as HTMLImageElement

    const context = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 120 })),
      fillText: vi.fn(),
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement

    await drawProjectFrame({
      canvas,
      project,
      sourceVideo: null,
      sourceImage: image,
      outputTimeMs: 0,
    })

    expect(context.font).toContain('Inter, system-ui, sans-serif')
    expect(context.roundRect).toHaveBeenCalled()
    expect(context.fillText).toHaveBeenCalled()
  })

  it('rejects when metadata loading fails before a seek', async () => {
    const listeners = new Map<string, EventListener>()
    const video = {
      readyState: 0,
      currentTime: 0,
      addEventListener: vi.fn((name: string, handler: EventListener) => {
        listeners.set(name, handler)
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const promise = seekVideo(video, 100)
    listeners.get('error')?.(new Event('error'))

    await expect(promise).rejects.toThrow('Video metadata failed to load')
  })

  it('rejects when a seek operation itself fails', async () => {
    const listeners = new Map<string, EventListener>()
    const video = {
      readyState: 1,
      currentTime: 0,
      addEventListener: vi.fn((name: string, handler: EventListener) => {
        listeners.set(name, handler)
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    const promise = seekVideo(video, 100)
    listeners.get('error')?.(new Event('error'))

    await expect(promise).rejects.toThrow('Video seek failed')
  })

  it('computes readable durations from the project clip', () => {
    const project = createProject()
    project.clip!.trimStartMs = 500
    project.clip!.trimEndMs = 3500
    project.clip!.playbackRate = 2

    expect(clipReadableDuration(project)).toBe(3000)
    expect(projectReadableDuration(project)).toBe(1500)
    expect(projectReadableDuration({ ...project, clip: null })).toBe(0)
    expect(clipReadableDuration({ ...project, clip: null })).toBe(0)
  })
})
