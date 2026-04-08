import { useCallback, useState } from 'react'
import type { MutableRefObject } from 'react'
import { clamp, outputDurationMs } from '@trimmr/shared'
import type { EditorProject } from '@trimmr/shared'
import { seekVideo } from '../lib/renderProjectFrame'
import { nextWebKitPlaybackState, type WebKitPlaybackState } from './webkitPlaybackState'

const PAUSED_VIDEO_SYNC_SUPPRESS_AFTER_PLAYING_SEEK_MS = 700

export function useWebKitPlaybackController({
  isWebKit,
  projectRef,
  videoRef,
  isPlayingRef,
  playheadRef,
  pendingPlayingSeekOutputMsRef,
  suppressPausedDebouncedSeekUntilRef,
  pausedPreviewSourceMs,
  setPlayheadMs,
  scrubLog,
}: {
  isWebKit: boolean
  projectRef: MutableRefObject<EditorProject>
  videoRef: MutableRefObject<HTMLVideoElement | null>
  isPlayingRef: MutableRefObject<boolean>
  playheadRef: MutableRefObject<number>
  pendingPlayingSeekOutputMsRef: MutableRefObject<number | null>
  suppressPausedDebouncedSeekUntilRef: MutableRefObject<number>
  pausedPreviewSourceMs: (project: EditorProject, outputTimeMs: number) => number
  setPlayheadMs: (ms: number) => void
  scrubLog: (...args: unknown[]) => void
}) {
  const [webkitPlaybackState, setWebkitPlaybackState] = useState<WebKitPlaybackState>('idle')
  const transition = useCallback((event: Parameters<typeof nextWebKitPlaybackState>[1]) => {
    setWebkitPlaybackState((current) => nextWebKitPlaybackState(current, event))
  }, [])

  const seekDuringPlayback = useCallback(
    async (outputMs: number, reason: string) => {
      const p = projectRef.current
      const video = videoRef.current
      if (!p?.clip || p.source?.kind !== 'video' || !video) {
        return
      }
      transition('seek_started')
      const seekOutputMs = clamp(outputMs, 0, outputDurationMs(p.clip))
      const seekSourceMs = pausedPreviewSourceMs(p, seekOutputMs)
      const shouldResume =
        isPlayingRef.current || (!video.paused && typeof video.paused === 'boolean')
      pendingPlayingSeekOutputMsRef.current = seekOutputMs
      suppressPausedDebouncedSeekUntilRef.current =
        Date.now() + PAUSED_VIDEO_SYNC_SUPPRESS_AFTER_PLAYING_SEEK_MS
      scrubLog(reason, { outputMs: seekOutputMs, sourceMs: seekSourceMs, isWebKit })
      try {
        if (isWebKit) {
          if (!video.paused) {
            video.pause()
          }
          await Promise.race([
            seekVideo(video, seekSourceMs),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('playing seek timeout')), 6_000)),
          ])
          playheadRef.current = seekOutputMs
          setPlayheadMs(seekOutputMs)
          if (shouldResume && isPlayingRef.current) {
            await video.play()
          }
          transition('seek_succeeded')
          transition('play_started')
        } else {
          await seekVideo(video, seekSourceMs)
          transition('seek_succeeded')
        }
      } catch (error) {
        transition('seek_failed')
        scrubLog(`${reason} failed`, error)
      } finally {
        pendingPlayingSeekOutputMsRef.current = null
      }
    },
    [
      isPlayingRef,
      isWebKit,
      pausedPreviewSourceMs,
      pendingPlayingSeekOutputMsRef,
      playheadRef,
      projectRef,
      scrubLog,
      setPlayheadMs,
      suppressPausedDebouncedSeekUntilRef,
      transition,
      videoRef,
    ],
  )

  const markSourceAttached = useCallback(() => transition('source_attached'), [transition])
  const resetWebKitPlayback = useCallback(() => transition('reset'), [transition])

  return {
    webkitPlaybackState,
    seekDuringPlayback,
    markSourceAttached,
    resetWebKitPlayback,
  }
}
