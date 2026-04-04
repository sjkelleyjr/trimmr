/** Matches apps/web dependency @ffmpeg/core; ESM build required (module worker uses dynamic import). CDN keeps Pages deploys under asset size limits. */
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

export type LoadedFfmpeg = {
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
}

let ffmpegSingletonPromise: Promise<LoadedFfmpeg> | null = null

export async function loadFfmpeg(): Promise<LoadedFfmpeg> {
  if (!ffmpegSingletonPromise) {
    ffmpegSingletonPromise = (async () => {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])

      const ffmpeg = new FFmpeg() as unknown as LoadedFfmpeg['ffmpeg']
      try {
        const env = (import.meta as ImportMeta & {
          env?: { DEV?: boolean; VITE_FFMPEG_CORE_BASE?: string }
        }).env
        const overrideBase = env?.VITE_FFMPEG_CORE_BASE?.replace(/\/$/, '')
        const useLocal =
          Boolean(env?.DEV) &&
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
