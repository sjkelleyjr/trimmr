import { describe, expect, it, vi } from 'vitest'
import {
  createProjectSummary,
  downloadBlob,
  exportPreviewToWebM,
  exportVideoProjectToWebM,
  extractSourceMedia,
  formatFileSize,
  loadDraft,
  saveDraft,
} from '@trimmr/media-engine'
import { createProject } from './test/factories'

function installIndexedDbMock() {
  const store = new Map<string, unknown>()

  const db = {
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn((_name: string, _mode: 'readonly' | 'readwrite') => {
      const transaction = {
        error: null,
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
        objectStore: vi.fn(() => ({
          put(value: unknown, key: string) {
            store.set(key, value)
            queueMicrotask(() => transaction.oncomplete?.())
          },
          delete(key: string) {
            store.delete(key)
            queueMicrotask(() => transaction.oncomplete?.())
          },
          get(key: string) {
            const request = {
              result: store.get(key),
              onsuccess: null as null | (() => void),
              onerror: null as null | (() => void),
            }
            queueMicrotask(() => request.onsuccess?.())
            return request
          },
        })),
      }
      return transaction
    }),
  }

  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const request = {
        result: db,
        error: null,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
      }
      queueMicrotask(() => {
        request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    }),
  })

  return { db }
}

/** `extractSourceMedia` probes video via `src = objectURL`; fake that assignment path in jsdom. */
function mockExtractVideoElement(
  mode: 'metadata' | 'error',
  dims?: { w: number; h: number; dur: number },
) {
  const video = {
    preload: '',
    muted: false,
    playsInline: false,
    videoWidth: dims?.w ?? 1920,
    videoHeight: dims?.h ?? 1080,
    duration: dims?.dur ?? 2.4,
    onloadedmetadata: null as null | (() => void),
    onerror: null as null | (() => void),
    set src(_value: string) {
      queueMicrotask(() => {
        if (mode === 'error') {
          video.onerror?.()
        } else {
          video.onloadedmetadata?.()
        }
      })
    },
  }
  return video
}

describe('media engine', () => {
  it('saves and loads drafts through indexedDB', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const { db } = installIndexedDbMock()
    const project = createProject()

    await saveDraft(project)
    const loaded = await loadDraft()

    expect(db.createObjectStore).toHaveBeenCalledWith('drafts')
    expect(db.transaction).toHaveBeenCalled()
    expect(loaded).toEqual(project)
    expect(db.close).toHaveBeenCalledTimes(2)
  })

  it('returns null when no draft has been saved yet', async () => {
    installIndexedDbMock()
    await expect(loadDraft()).resolves.toBeNull()
  })

  it('restores a fresh object URL for the source file on load', async () => {
    installIndexedDbMock()
    const project = createProject({
      source: {
        ...createProject().source!,
        objectUrl: 'blob:source-before-refresh',
      },
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['video-bytes'], { type: 'video/webm' }), { status: 200 }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source-after-refresh')

    await saveDraft(project)
    const loaded = await loadDraft()

    expect(fetch).toHaveBeenCalledWith('blob:source-before-refresh')
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(loaded?.source?.objectUrl).toBe('blob:source-after-refresh')
    expect(loaded?.source?.videoSrcBlob).toBeDefined()
    expect((loaded?.source?.videoSrcBlob as Blob).size).toBeGreaterThan(0)
  })

  it('rejects draft operations when indexedDB fails to open', async () => {
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = {
          result: null,
          error: new Error('db failed'),
          onupgradeneeded: null as null | (() => void),
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
        }
        queueMicrotask(() => request.onerror?.())
        return request
      }),
    })

    await expect(loadDraft()).rejects.toThrow('db failed')
  })

  it('extracts video source metadata', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video')
    const originalCreateElement = document.createElement.bind(document)
    const createElement = vi.spyOn(document, 'createElement')

    createElement.mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        return mockExtractVideoElement('metadata') as unknown as HTMLVideoElement
      }

      return originalCreateElement(tagName)
    })

    const file = new File(['video'], 'demo.mp4', { type: 'video/mp4' })
    const source = await extractSourceMedia(file)

    expect(source).toMatchObject({
      name: 'demo.mp4',
      objectUrl: 'blob:video',
      mimeType: 'video/mp4',
      kind: 'video',
      format: 'mp4',
      width: 1920,
      height: 1080,
      durationMs: 2400,
      fileSizeBytes: 5,
      estimatedBitrateKbps: 1,
      audioTrackStatus: 'unknown',
    })
    expect(source.videoSrcBlob).toBe(file)
  })

  it('treats octet-stream WebM as video when EBML magic matches', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video')
    const originalCreateElement = document.createElement.bind(document)
    const createElement = vi.spyOn(document, 'createElement')

    createElement.mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        return mockExtractVideoElement('metadata', { w: 1280, h: 720, dur: 1 }) as unknown as HTMLVideoElement
      }

      return originalCreateElement(tagName)
    })

    const ebml = new Uint8Array(64)
    ebml.set([0x1a, 0x45, 0xdf, 0xa3])
    const file = new File([ebml], 'clip.webm', { type: 'application/octet-stream' })
    const source = await extractSourceMedia(file)

    expect(source.kind).toBe('video')
    expect(source.format).toBe('webm')
    expect(source.mimeType).toBe('video/webm')
    expect(source.importCodecProbe).toBeDefined()
    // Byte sniffing is covered in `importCodecProbe.test.ts`; jsdom `File` may not round-trip bytes for EBML.
  })

  it('extracts animated-image metadata and falls back to octet-stream mime types', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')

    class FakeImage {
      naturalWidth = 640
      naturalHeight = 480
      onload: null | (() => void) = null
      onerror: null | (() => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', FakeImage)

    const source = await extractSourceMedia(new File(['img'], 'loop.apng', { type: '' }))

    expect(source).toMatchObject({
      name: 'loop.apng',
      objectUrl: 'blob:image',
      mimeType: 'application/octet-stream',
      kind: 'animated-image',
      format: 'apng',
      width: 640,
      height: 480,
      durationMs: 3000,
      fileSizeBytes: 3,
      estimatedBitrateKbps: 1,
      audioTrackStatus: 'absent',
    })
  })

  it('extracts unknown image formats and reports unknown format', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')

    class FakeImage {
      naturalWidth = 320
      naturalHeight = 240
      onload: null | (() => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', FakeImage)

    const source = await extractSourceMedia(new File(['img'], 'note.txt', { type: 'text/plain' }))

    expect(source.format).toBe('unknown')
    expect(source.mimeType).toBe('text/plain')
  })

  it('detects gif and animated webp image formats', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')

    class FakeImage {
      naturalWidth = 320
      naturalHeight = 240
      onload: null | (() => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', FakeImage)

    const gif = await extractSourceMedia(new File(['img'], 'loop.gif', { type: 'image/gif' }))
    const webp = await extractSourceMedia(new File(['img'], 'loop.webp', { type: 'image/webp' }))

    expect(gif.format).toBe('gif')
    expect(webp.format).toBe('animated-webp')
  })

  it('detects the image/apng mime type directly', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')

    class FakeImage {
      naturalWidth = 320
      naturalHeight = 240
      onload: null | (() => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', FakeImage)

    const apng = await extractSourceMedia(new File(['img'], 'loop.png', { type: 'image/apng' }))

    expect(apng.format).toBe('apng')
  })

  it('rejects when metadata loading fails', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken')
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        return mockExtractVideoElement('error') as unknown as HTMLVideoElement
      }

      return originalCreateElement(tagName)
    })

    await expect(
      extractSourceMedia(new File(['video'], 'broken.webm', { type: 'video/webm' })),
    ).rejects.toThrow('Unable to load video metadata')
  })

  it('rejects when image metadata loading fails', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken-image')

    class FakeImage {
      naturalWidth = 0
      naturalHeight = 0
      onload: null | (() => void) = null
      onerror: null | (() => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }

    vi.stubGlobal('Image', FakeImage)

    await expect(
      extractSourceMedia(new File(['img'], 'broken.gif', { type: 'image/gif' })),
    ).rejects.toThrow('Unable to load image metadata')
  })

  it('exports a preview to webm and keeps only non-empty chunks', async () => {
    vi.useFakeTimers()

    const stream = {} as MediaStream
    const captureStream = vi.fn(() => stream)
    const canvas = { captureStream } as unknown as HTMLCanvasElement
    const drawFrame = vi.fn()

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(() => false)
      mimeType: string
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null

      constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'video/webm'
      }

      start(_timeslice?: number) {}

      stop() {
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([]) })
          this.ondataavailable?.({ data: new Blob(['frame']) })
          this.onstop?.()
        })
      }
    }

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const resultPromise = exportPreviewToWebM({
      canvas,
      drawFrame,
      durationMs: 100,
      preset: {
        format: 'webm',
        width: 720,
        height: 720,
        fps: 10,
      },
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(captureStream).toHaveBeenCalledWith(10)
    expect(drawFrame).toHaveBeenCalledTimes(1)
    expect(result.filename).toMatch(/^trimmr-export-\d+\.webm$/)
    expect(result.mimeType).toBe('video/webm')
    expect(result.blob.size).toBeGreaterThan(0)
  })

  it('prefers the vp9 recorder mime type when supported', async () => {
    vi.useFakeTimers()

    const canvas = {
      captureStream: vi.fn(() => ({} as MediaStream)),
    } as unknown as HTMLCanvasElement

    const options: Array<{ mimeType: string }> = []

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(() => true)
      mimeType: string
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null

      constructor(_stream: MediaStream, recorderOptions: { mimeType: string }) {
        this.mimeType = recorderOptions.mimeType
        options.push(recorderOptions)
      }

      start(_timeslice?: number) {}

      stop() {
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['frame']) })
          this.onstop?.()
        })
      }
    }

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const resultPromise = exportPreviewToWebM({
      canvas,
      drawFrame: vi.fn(),
      durationMs: 100,
      preset: {
        format: 'webm',
        width: 720,
        height: 720,
        fps: 10,
      },
    })

    await vi.runAllTimersAsync()
    await resultPromise

    expect(options[0]).toEqual({ mimeType: 'video/webm;codecs=vp9' })
  })

  it('exports video projects with audio tracks when captureStream is available', async () => {
    vi.spyOn(window, 'setInterval').mockImplementation((fn: TimerHandler) => {
      queueMicrotask(async () => {
        for (let i = 0; i < 10; i++) {
          if (typeof fn === 'function') fn()
          await Promise.resolve()
        }
      })
      return 1 as unknown as number
    })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})

    const canvasVideoTrack = { kind: 'video', stop: vi.fn() }
    const audioTrack = { kind: 'audio', stop: vi.fn() }
    const canvasStream = {
      getVideoTracks: vi.fn(() => [canvasVideoTrack]),
      getTracks: vi.fn(() => [canvasVideoTrack]),
    } as unknown as MediaStream

    const canvas = {
      captureStream: vi.fn(() => canvasStream),
    } as unknown as HTMLCanvasElement

    const combinedTracks: unknown[] = []
    class FakeMediaStream {
      addTrack(track: unknown) {
        combinedTracks.push(track)
      }
    }

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(
        (mimeType: string) =>
          mimeType === 'video/webm;codecs=vp9,opus' ||
          mimeType === 'video/webm;codecs=vp9' ||
          mimeType === 'video/webm;codecs=vp8,opus' ||
          mimeType === 'video/webm;codecs=vp8' ||
          mimeType === 'video/webm',
      )
      mimeType: string
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null
      state: 'inactive' | 'recording' = 'inactive'

      constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'video/webm;codecs=vp9,opus'
      }

      start(_timeslice?: number) {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['frame']) })
          this.onstop?.()
        })
      }
    }

    vi.stubGlobal('MediaStream', FakeMediaStream as unknown as typeof MediaStream)
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        let currentTime = 0
        const listeners = new Map<string, EventListener>()
        const sourceStream = {
          getAudioTracks: () => [audioTrack],
          getTracks: () => [audioTrack],
        }

        const video = {
          src: '',
          preload: '',
          playsInline: false,
          muted: false,
          readyState: 1,
          addEventListener: vi.fn((name: string, handler: EventListener) => {
            listeners.set(name, handler)
          }),
          removeEventListener: vi.fn((name: string) => {
            listeners.delete(name)
          }),
          play: vi.fn(async () => {
            currentTime = 0.25
          }),
          pause: vi.fn(),
          captureStream: vi.fn(() => sourceStream),
          get currentTime() {
            return currentTime
          },
          set currentTime(value: number) {
            currentTime = value
            queueMicrotask(() => listeners.get('seeked')?.(new Event('seeked')))
          },
          playbackRate: 1,
        }

        return video as unknown as HTMLVideoElement
      }

      return originalCreateElement(tagName)
    })

    const renderFrame = vi.fn(async (video: HTMLVideoElement) => {
      Object.defineProperty(video, 'currentTime', {
        value: 1,
        configurable: true,
        writable: true,
      })
    })

    const result = await exportVideoProjectToWebM({
      canvas,
      sourceUrl: 'blob:video',
      trimStartMs: 0,
      trimEndMs: 500,
      playbackRate: 1,
      preset: {
        format: 'webm',
        width: 720,
        height: 720,
        fps: 24,
      },
      renderFrame,
    })

    expect(canvas.captureStream).toHaveBeenCalledWith(24)
    expect(renderFrame).toHaveBeenCalled()
    expect(combinedTracks).toContain(canvasVideoTrack)
    expect(combinedTracks).toContain(audioTrack)
    expect(result.mimeType.startsWith('video/webm')).toBe(true)
  })

  /**
   * Regression: Safari / Playwright WebKit uses a seek-based export path. A stray
   * reference to a removed `waitForSeek` helper caused ReferenceError and hung mobile export.
   * Audio is omitted on this path (canvas + MediaRecorder only).
   */
  it('exports video projects on WebKit seek path without throwing', async () => {
    const previousUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    })

    vi.spyOn(window, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') {
        queueMicrotask(() => (fn as () => void)())
      }
      return 1 as unknown as number
    })
    vi.spyOn(window, 'setInterval').mockImplementation((fn: TimerHandler) => {
      queueMicrotask(() => {
        if (typeof fn === 'function') {
          ;(fn as () => void)()
        }
      })
      return 2 as unknown as number
    })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    vi.spyOn(window, 'clearTimeout').mockImplementation(() => {})

    const canvasVideoTrack = { kind: 'video', stop: vi.fn() }
    const canvasStream = {
      getVideoTracks: vi.fn(() => [canvasVideoTrack]),
      getTracks: vi.fn(() => [canvasVideoTrack]),
    } as unknown as MediaStream

    const canvas = {
      captureStream: vi.fn(() => canvasStream),
    } as unknown as HTMLCanvasElement

    const combinedTracks: unknown[] = []
    class FakeMediaStream {
      addTrack(track: unknown) {
        combinedTracks.push(track)
      }
    }

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(
        (mimeType: string) =>
          mimeType === 'video/webm;codecs=vp9' ||
          mimeType === 'video/webm;codecs=vp8' ||
          mimeType === 'video/webm',
      )
      mimeType = 'video/webm;codecs=vp8'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null
      state: 'inactive' | 'recording' = 'inactive'

      start(_timeslice?: number) {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['frame']) })
          this.onstop?.()
        })
      }
    }

    vi.stubGlobal('MediaStream', FakeMediaStream as unknown as typeof MediaStream)
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        let currentTime = 0
        const listeners = new Map<string, EventListener>()

        const video = {
          src: '',
          preload: '',
          playsInline: false,
          muted: false,
          readyState: 1,
          duration: 1,
          addEventListener: vi.fn((name: string, handler: EventListener) => {
            listeners.set(name, handler)
          }),
          removeEventListener: vi.fn((name: string) => {
            listeners.delete(name)
          }),
          play: vi.fn(async () => {
            currentTime = 0.1
          }),
          pause: vi.fn(),
          get seeking() {
            return false
          },
          get currentTime() {
            return currentTime
          },
          set currentTime(value: number) {
            currentTime = value
            queueMicrotask(() => listeners.get('seeked')?.(new Event('seeked')))
          },
          playbackRate: 1,
        }

        return video as unknown as HTMLVideoElement
      }

      return originalCreateElement(tagName)
    })

    const renderFrame = vi.fn(async () => {})

    try {
      const result = await exportVideoProjectToWebM({
        canvas,
        sourceUrl: 'blob:video',
        trimStartMs: 0,
        trimEndMs: 100,
        playbackRate: 1,
        preset: {
          format: 'webm',
          width: 720,
          height: 720,
          fps: 10,
        },
        renderFrame,
      })

      expect(canvas.captureStream).toHaveBeenCalledWith(10)
      expect(renderFrame).toHaveBeenCalled()
      expect(combinedTracks).toEqual([canvasVideoTrack])
      expect(result.mimeType.startsWith('video/webm')).toBe(true)
    } finally {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: previousUa,
      })
    }
  })

  it('downloads blobs through an anchor element', () => {
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click

    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    downloadBlob({
      blob: new Blob(['hello']),
      filename: 'test.webm',
      mimeType: 'video/webm',
      requestedFormat: 'webm',
      outputFormat: 'webm',
    })

    expect(anchor.href).toBe('blob:download')
    expect(anchor.download).toBe('test.webm')
    expect(click).toHaveBeenCalled()
  })

  it('summarizes the current project state', () => {
    const project = createProject()
    project.clip!.trimStartMs = 1000
    project.clip!.trimEndMs = 5000
    project.clip!.playbackRate = 1.5
    project.exportPreset.format = 'gif'

    expect(createProjectSummary(project)).toEqual({
      source: 'clip.mp4',
      durationMs: 4000,
      playbackRate: 1.5,
      exportFormat: 'gif',
    })
  })

  it('summarizes an empty project safely', () => {
    expect(
      createProjectSummary({
        ...createProject(),
        source: null,
        clip: null,
      }),
    ).toEqual({
      source: null,
      durationMs: 0,
      playbackRate: 1,
      exportFormat: 'webm',
    })
  })

  it('formats file sizes for diagnostics', () => {
    expect(formatFileSize(900)).toBe('900 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
