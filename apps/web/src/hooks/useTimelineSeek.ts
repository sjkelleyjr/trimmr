import { useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { clamp, outputDurationMs } from '@trimmr/shared'
import type { EditorProject } from '@trimmr/shared'

export function useTimelineSeek({
  playheadMs,
  timelinePointerActive,
  trimPointerActive,
  playheadRef,
  scrubPlayheadOutputMsRef,
  timelineScrubActiveRef,
  timelineClickTargetOutputMsRef,
  projectRef,
  isPlayingRef,
  videoRef,
  setPlayheadMs,
  setTimelinePointerActive,
  setTrimPointerActive,
  seekVideoDuringPlayback,
  flushPausedVideoSeek,
  scrubLog,
}: {
  playheadMs: number
  timelinePointerActive: boolean
  trimPointerActive: boolean
  playheadRef: MutableRefObject<number>
  scrubPlayheadOutputMsRef: MutableRefObject<number>
  timelineScrubActiveRef: MutableRefObject<boolean>
  timelineClickTargetOutputMsRef: MutableRefObject<number | null>
  projectRef: MutableRefObject<EditorProject>
  isPlayingRef: MutableRefObject<boolean>
  videoRef: MutableRefObject<HTMLVideoElement | null>
  setPlayheadMs: (value: number | ((prev: number) => number)) => void
  setTimelinePointerActive: (active: boolean) => void
  setTrimPointerActive: (active: boolean) => void
  seekVideoDuringPlayback: (outputMs: number, reason: string) => Promise<void>
  flushPausedVideoSeek: () => Promise<void>
  scrubLog: (...args: unknown[]) => void
}) {
  useEffect(() => {
    playheadRef.current = playheadMs
  }, [playheadMs, playheadRef])

  useEffect(() => {
    if (timelinePointerActive) {
      return
    }
    scrubPlayheadOutputMsRef.current = playheadMs
  }, [playheadMs, timelinePointerActive, scrubPlayheadOutputMsRef])

  const handlePlayheadRangeInput = useCallback(
    (event: { currentTarget: HTMLInputElement }) => {
      const v = Number(event.currentTarget.value)
      scrubPlayheadOutputMsRef.current = v
      playheadRef.current = v
      setPlayheadMs(v)
    },
    [playheadRef, scrubPlayheadOutputMsRef, setPlayheadMs],
  )

  const finalizeTimelineScrub = useCallback(() => {
    if (!timelineScrubActiveRef.current) {
      return
    }
    timelineScrubActiveRef.current = false
    const end = () => {
      scrubLog('timeline: pointer/touch up -> flush seek')
      const p = projectRef.current
      let committedOutputMs = playheadRef.current
      if (p?.clip) {
        const maxOut = outputDurationMs(p.clip)
        const candidate = timelineClickTargetOutputMsRef.current ?? scrubPlayheadOutputMsRef.current
        const v = clamp(candidate, 0, maxOut)
        committedOutputMs = v
        scrubLog('timeline: release commit', {
          committedOutputMs,
          clickTargetOutputMs: timelineClickTargetOutputMsRef.current,
          scrubRefOutputMs: scrubPlayheadOutputMsRef.current,
        })
        playheadRef.current = v
        setPlayheadMs(v)
      }

      if (isPlayingRef.current && p?.source?.kind === 'video' && videoRef.current) {
        const seekOutputMs = committedOutputMs
        timelineClickTargetOutputMsRef.current = null
        setTimelinePointerActive(false)
        void seekVideoDuringPlayback(seekOutputMs, 'timeline: seek while playing')
        return
      }

      timelineClickTargetOutputMsRef.current = null
      setTimelinePointerActive(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const p2 = projectRef.current
          if (p2?.clip) {
            const v = clamp(committedOutputMs, 0, outputDurationMs(p2.clip))
            playheadRef.current = v
            setPlayheadMs(v)
          }
          void flushPausedVideoSeek()
        })
      })
    }
    end()
  }, [
    flushPausedVideoSeek,
    isPlayingRef,
    playheadRef,
    projectRef,
    scrubLog,
    scrubPlayheadOutputMsRef,
    seekVideoDuringPlayback,
    setPlayheadMs,
    setTimelinePointerActive,
    timelineClickTargetOutputMsRef,
    timelineScrubActiveRef,
    videoRef,
  ])

  useEffect(() => {
    window.addEventListener('pointerup', finalizeTimelineScrub)
    window.addEventListener('pointercancel', finalizeTimelineScrub)
    window.addEventListener('touchend', finalizeTimelineScrub)
    // Firefox: some builds finalize range-thumb drags more reliably via mouseup than pointerup alone.
    window.addEventListener('mouseup', finalizeTimelineScrub)
    return () => {
      window.removeEventListener('pointerup', finalizeTimelineScrub)
      window.removeEventListener('pointercancel', finalizeTimelineScrub)
      window.removeEventListener('touchend', finalizeTimelineScrub)
      window.removeEventListener('mouseup', finalizeTimelineScrub)
    }
  }, [finalizeTimelineScrub])

  useEffect(() => {
    if (!trimPointerActive) {
      return
    }
    const end = () => setTrimPointerActive(false)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    window.addEventListener('touchend', end, true)
    return () => {
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('touchend', end, true)
    }
  }, [setTrimPointerActive, trimPointerActive])

  return {
    handlePlayheadRangeInput,
    finalizeTimelineScrub,
  }
}
