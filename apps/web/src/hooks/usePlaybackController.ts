import { useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { lastSourceFrameTimeMs, outputDurationMs } from '@trimmr/shared'
import type { EditorProject } from '@trimmr/shared'
import { mapSourceTimeToOutputTime } from '../lib/renderProjectFrame'

export function usePlaybackController({
  project,
  playheadMs,
  maxOutputDurationMs,
  isPlaying,
  setIsPlaying,
  setPlayheadMs,
  playheadRef,
  pendingPlayingSeekOutputMsRef,
  videoRef,
  audioContextRef,
  pausedPreviewSourceMs,
  animationRef,
  lastFrameRef,
  setStatus,
}: {
  project: EditorProject
  playheadMs: number
  maxOutputDurationMs: number
  isPlaying: boolean
  setIsPlaying: (value: boolean | ((prev: boolean) => boolean)) => void
  setPlayheadMs: (value: number | ((prev: number) => number)) => void
  playheadRef: MutableRefObject<number>
  pendingPlayingSeekOutputMsRef: MutableRefObject<number | null>
  videoRef: MutableRefObject<HTMLVideoElement | null>
  audioContextRef: MutableRefObject<AudioContext | null>
  pausedPreviewSourceMs: (project: EditorProject, outputTimeMs: number) => number
  animationRef: MutableRefObject<number | null>
  lastFrameRef: MutableRefObject<number | null>
  setStatus: (status: string) => void
}) {
  const togglePlayback = useCallback(() => {
    if (!project.clip) {
      return
    }

    if (!isPlaying && audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {})
    }

    if (!isPlaying && playheadMs >= maxOutputDurationMs) {
      setPlayheadMs(0)
    }

    setIsPlaying((current) => !current)
  }, [audioContextRef, isPlaying, maxOutputDurationMs, playheadMs, project.clip, setIsPlaying, setPlayheadMs])

  useEffect(() => {
    if (!isPlaying || !project.clip) {
      lastFrameRef.current = null
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    if (project.source?.kind === 'video' && videoRef.current) {
      const video = videoRef.current
      const trimEndsAtSourceEnd =
        Math.abs((project.source.durationMs ?? project.clip.trimEndMs) - project.clip.trimEndMs) <= 50

      video.playbackRate = project.clip.playbackRate
      video.currentTime = pausedPreviewSourceMs(project, playheadRef.current) / 1000

      const handleEnded = () => {
        setPlayheadMs(outputDurationMs(project.clip!))
        setIsPlaying(false)
      }

      video.addEventListener('ended', handleEnded)

      void video.play().catch(() => {
        setStatus('Browser blocked autoplay with sound. Press play again or interact with the page.')
      })

      const step = (timestamp: number) => {
        lastFrameRef.current = timestamp

        const projectDuration = outputDurationMs(project.clip!)
        const sourceTimeMs = Math.min(video.currentTime * 1000, project.clip!.trimEndMs)
        const mappedOutputMs = mapSourceTimeToOutputTime(project, sourceTimeMs)
        const pendingOutputMs = pendingPlayingSeekOutputMsRef.current
        if (pendingOutputMs !== null) {
          if (Math.abs(mappedOutputMs - pendingOutputMs) < 120) {
            pendingPlayingSeekOutputMsRef.current = null
            setPlayheadMs(mappedOutputMs)
          } else {
            setPlayheadMs(pendingOutputMs)
          }
        } else {
          setPlayheadMs(mappedOutputMs)
        }

        if (!trimEndsAtSourceEnd && sourceTimeMs >= project.clip!.trimEndMs) {
          video.currentTime = lastSourceFrameTimeMs(project.clip!) / 1000
          video.pause()
          setIsPlaying(false)
          setPlayheadMs(projectDuration)
          return
        }

        animationRef.current = requestAnimationFrame(step)
      }

      animationRef.current = requestAnimationFrame(step)

      return () => {
        video.removeEventListener('ended', handleEnded)
        video.pause()
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    }

    const step = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp
      const delta = timestamp - previous
      lastFrameRef.current = timestamp

      setPlayheadMs((current) => {
        const next = current + delta
        const projectDuration = outputDurationMs(project.clip!)
        if (next >= projectDuration) {
          setIsPlaying(false)
          return projectDuration
        }
        return next
      })

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(step)
      }
    }

    animationRef.current = requestAnimationFrame(step)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [
    animationRef,
    isPlaying,
    pendingPlayingSeekOutputMsRef,
    pausedPreviewSourceMs,
    playheadRef,
    project,
    setIsPlaying,
    setPlayheadMs,
    setStatus,
    videoRef,
    lastFrameRef,
  ])

  return { togglePlayback }
}
