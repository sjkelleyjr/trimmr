import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  applyCommand,
  commit,
  createEmptyProject,
  createHistory,
  redo,
  undo,
} from '@trimmr/editor-core'
import {
  type ExportProgress,
  createProjectSummary,
  downloadBlob,
  exportPreviewToWebM,
  exportVideoProjectToWebM,
  extractSourceMedia,
  loadDraft,
  saveDraft,
} from '@trimmr/media-engine'
import {
  clamp,
  formatDuration,
  lastSourceFrameTimeMs,
  outputDurationMs,
  timelineSnapshot,
} from '@trimmr/shared'
import { Field, Panel, PrimaryButton, RangeField } from '@trimmr/ui'
import './App.css'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import {
  drawProjectFrame,
  mapSourceTimeToOutputTime,
  mapOutputTimeToSourceTime,
  projectReadableDuration,
} from './lib/renderProjectFrame'

const FONT_OPTIONS = [
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
  { label: 'Display', value: '"Arial Black", Impact, sans-serif' },
]

const EXPORT_CANVAS_PRESETS = [
  { value: '720x720', label: 'Square 720 — 720 × 720' },
  { value: '720x1280', label: 'Portrait 9:16 — 720 × 1280' },
  { value: '960x540', label: 'Landscape 16:9 — 960 × 540' },
] as const

const WORKFLOW_QUERY_VALUES = [
  'trim-gif',
  'resize-gif',
  'add-text-to-gif',
  'video-to-gif',
  'gif-speed-changer',
] as const

type WorkflowQueryValue = (typeof WORKFLOW_QUERY_VALUES)[number]

function parseExportCanvasSize(value: string): { width: number; height: number } {
  const [w, h] = value.split('x').map((part) => Number(part))
  return { width: w, height: h }
}

function exportCanvasMatchesPreset(width: number, height: number): boolean {
  return EXPORT_CANVAS_PRESETS.some((preset) => {
    const parsed = parseExportCanvasSize(preset.value)
    return parsed.width === width && parsed.height === height
  })
}

function overlayBackgroundCss(backgroundOpacity: number) {
  return `rgba(0, 0, 0, ${backgroundOpacity})`
}

function pickAnimatedFrameIndex(cumulativeDurationsMs: number[], sourceTimeMs: number, totalDurationMs: number) {
  if (cumulativeDurationsMs.length === 0 || totalDurationMs <= 0) {
    return 0
  }

  const loopedTime = ((sourceTimeMs % totalDurationMs) + totalDurationMs) % totalDurationMs
  let frameIndex = 0
  while (
    frameIndex < cumulativeDurationsMs.length &&
    loopedTime >= (cumulativeDurationsMs[frameIndex] ?? totalDurationMs)
  ) {
    frameIndex += 1
  }

  return Math.min(frameIndex, cumulativeDurationsMs.length - 1)
}

function VolumeIcon({
  hasControllableAudio,
  previewVolumePct,
}: {
  hasControllableAudio: boolean
  previewVolumePct: number
}) {
  const isMuted = previewVolumePct === 0

  return (
    <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      {hasControllableAudio ? (
        isMuted ? (
          <>
            <path d="M3 10v4h4l5 4V6L7 10H3Z" />
            <path d="M16.7 8.3a1 1 0 0 1 1.4 0l1.6 1.6 1.6-1.6a1 1 0 1 1 1.4 1.4l-1.6 1.6 1.6 1.6a1 1 0 1 1-1.4 1.4l-1.6-1.6-1.6 1.6a1 1 0 1 1-1.4-1.4l1.6-1.6-1.6-1.6a1 1 0 0 1 0-1.4Z" />
          </>
        ) : (
          <>
            <path d="M3 10v4h4l5 4V6L7 10H3Z" />
            <path d="M16.5 8.5a1 1 0 0 1 1.4 0 5 5 0 0 1 0 7 1 1 0 1 1-1.4-1.4 3 3 0 0 0 0-4.2 1 1 0 0 1 0-1.4Z" />
            <path d="M19.7 5.3a1 1 0 0 1 1.4 0 9 9 0 0 1 0 12.8 1 1 0 1 1-1.4-1.4 7 7 0 0 0 0-9.9 1 1 0 0 1 0-1.4Z" />
          </>
        )
      ) : (
        <>
          <path d="M4 10v4h4l5 4V6L8 10H4Z" />
          <path d="M16.7 8.3a1 1 0 0 1 1.4 0l1.6 1.6 1.6-1.6a1 1 0 1 1 1.4 1.4l-1.6 1.6 1.6 1.6a1 1 0 1 1-1.4 1.4l-1.6-1.6-1.6 1.6a1 1 0 1 1-1.4-1.4l1.6-1.6-1.6-1.6a1 1 0 0 1 0-1.4Z" />
        </>
      )}
    </svg>
  )
}

function App() {
  const workflowQuery = useMemo<WorkflowQueryValue | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }

    const workflow = new URLSearchParams(window.location.search).get('workflow')
    if (!workflow) {
      return null
    }

    return WORKFLOW_QUERY_VALUES.includes(workflow as WorkflowQueryValue)
      ? (workflow as WorkflowQueryValue)
      : null
  }, [])
  const [history, setHistory] = useState(() => createHistory(createEmptyProject()))
  const [playheadMs, setPlayheadMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewVolumePct, setPreviewVolumePct] = useState(100)
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false)
  const lastNonZeroVolumePctRef = useRef(100)
  const [, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgressPct, setExportProgressPct] = useState(0)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null)
  const [editingOverlayText, setEditingOverlayText] = useState('')
  const [copiedOverlay, setCopiedOverlay] = useState<(typeof history.present.overlays)[number] | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewFrameRef = useRef<HTMLDivElement | null>(null)
  const editingOverlayEditorRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const playheadRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animatedImageDecoderRef = useRef<ImageDecoder | null>(null)
  const animatedImageTimelineRef = useRef<{
    totalDurationMs: number
    cumulativeDurationsMs: number[]
  } | null>(null)
  const previousClipRef = useRef<(typeof history.present)['clip']>(null)
  const draggingOverlayIdRef = useRef<string | null>(null)
  const resizingOverlayRef = useRef<{
    id: string
    startClientX: number
    startClientY: number
    startFontSize: number
  } | null>(null)
  const [dragOverlayPosition, setDragOverlayPosition] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [resizeOverlayFontSize, setResizeOverlayFontSize] = useState<{
    id: string
    fontSize: number
  } | null>(null)
  const workflowAppliedSourceIdRef = useRef<string | null>(null)

  const project = history.present
  const hasControllableAudio =
    project.source?.kind === 'video' && project.source.audioTrackStatus !== 'absent'
  const snapshot = useMemo(() => timelineSnapshot(project), [project])
  const maxTimelineMs = project.source?.durationMs ?? 1000
  const maxOutputDurationMs = project.clip ? outputDurationMs(project.clip) : 0
  const timelineDenominator = Math.max(1, maxTimelineMs)
  const trimStartMs = project.clip?.trimStartMs ?? 0
  const trimEndMs = project.clip?.trimEndMs ?? maxTimelineMs
  const toTimelinePercent = useCallback(
    (ms: number) => `${(clamp(ms, 0, maxTimelineMs) / timelineDenominator) * 100}%`,
    [maxTimelineMs, timelineDenominator],
  )
  const playheadSourceMs = useMemo(() => {
    if (!project.clip) {
      return 0
    }

    return clamp(
      mapOutputTimeToSourceTime(project, playheadMs),
      project.clip.trimStartMs,
      project.clip.trimEndMs,
    )
  }, [playheadMs, project])

  const getVideoPreviewSourceTimeMs = useCallback(
    (outputTimeMs: number) => {
      if (!project.clip) {
        return 0
      }

      if (outputTimeMs >= maxOutputDurationMs) {
        return lastSourceFrameTimeMs(project.clip)
      }

      return mapOutputTimeToSourceTime(project, outputTimeMs)
    },
    [maxOutputDurationMs, project],
  )

  useEffect(() => {
    playheadRef.current = playheadMs
  }, [playheadMs])

  useEffect(() => {
    const previousClip = previousClipRef.current
    previousClipRef.current = project.clip

    if (!project.clip || !previousClip) {
      return
    }

    if (
      previousClip.trimStartMs === project.clip.trimStartMs &&
      previousClip.trimEndMs === project.clip.trimEndMs &&
      previousClip.playbackRate === project.clip.playbackRate
    ) {
      return
    }

    setPlayheadMs((current) => {
      const sourceTimeMs = clamp(
        previousClip.trimStartMs + current * previousClip.playbackRate,
        previousClip.trimStartMs,
        previousClip.trimEndMs,
      )
      const next = mapSourceTimeToOutputTime(project, sourceTimeMs)
      return Math.abs(next - current) < 1 ? current : next
    })
  }, [project])

  const runCommand = useCallback((command: Parameters<typeof commit>[1]) => {
    setHistory((currentHistory) => commit(currentHistory, command))
  }, [])
  const updateTrim = useCallback(
    (partial: { trimStartMs?: number; trimEndMs?: number }) => {
      runCommand({
        type: 'set-trim',
        trimStartMs: partial.trimStartMs ?? trimStartMs,
        trimEndMs: partial.trimEndMs ?? trimEndMs,
      })
    },
    [runCommand, trimEndMs, trimStartMs],
  )

  useEffect(() => {
    if (!workflowQuery || !project.source) {
      return
    }

    if (workflowAppliedSourceIdRef.current === project.source.id) {
      return
    }

    if (workflowQuery === 'video-to-gif') {
      runCommand({ type: 'set-export-format', format: 'gif' })
    }

    workflowAppliedSourceIdRef.current = project.source.id
  }, [project.source, runCommand, workflowQuery])

  const startOverlayEdit = useCallback((overlayId: string, text: string) => {
    setSelectedOverlayId(overlayId)
    setEditingOverlayId(overlayId)
    setEditingOverlayText(text)
  }, [])

  const closeOverlayEdit = useCallback(() => {
    setEditingOverlayId(null)
    setEditingOverlayText('')
  }, [])

  const commitOverlayText = useCallback(
    (overlayId: string, text: string) => {
      runCommand({
        type: 'set-overlay-text',
        overlayId,
        text,
      })
      closeOverlayEdit()
    },
    [closeOverlayEdit, runCommand],
  )

  const updateOverlayStyle = useCallback(
    (
      overlayId: string,
      nextStyle: {
        color?: string
        fontFamily?: string
        backgroundOpacity?: number
      },
    ) => {
      runCommand({
        type: 'set-overlay-style',
        overlayId,
        ...nextStyle,
      })
    },
    [runCommand],
  )

  const deleteOverlay = useCallback(
    (overlayId: string) => {
      runCommand({
        type: 'delete-overlay',
        overlayId,
      })
      if (dragOverlayPosition?.id === overlayId) {
        setDragOverlayPosition(null)
      }
      if (resizeOverlayFontSize?.id === overlayId) {
        setResizeOverlayFontSize(null)
      }
      if (draggingOverlayIdRef.current === overlayId) {
        draggingOverlayIdRef.current = null
      }
      if (resizingOverlayRef.current?.id === overlayId) {
        resizingOverlayRef.current = null
      }
      if (selectedOverlayId === overlayId) {
        setSelectedOverlayId(null)
      }
      closeOverlayEdit()
    },
    [closeOverlayEdit, dragOverlayPosition?.id, resizeOverlayFontSize?.id, runCommand, selectedOverlayId],
  )

  const handleAddOverlay = useCallback(() => {
    const nextY = Math.min(0.82, 0.32 + project.overlays.length * 0.1)
    const nextHistory = commit(history, {
      type: 'add-overlay',
      x: 0.5,
      y: nextY,
    })
    const nextOverlayId = nextHistory.present.overlays.at(-1)?.id ?? ''

    setHistory(nextHistory)

    if (nextOverlayId) {
      setSelectedOverlayId(nextOverlayId)
      setEditingOverlayId(nextOverlayId)
      setEditingOverlayText('')
    }
  }, [history, project.overlays.length])

  const copySelectedOverlay = useCallback(() => {
    if (!selectedOverlayId) {
      return
    }

    const overlay = project.overlays.find((item) => item.id === selectedOverlayId)
    if (!overlay) {
      return
    }

    setCopiedOverlay(structuredClone(overlay))
  }, [project.overlays, selectedOverlayId])

  const pasteOverlay = useCallback(() => {
    if (!copiedOverlay) {
      return
    }

    const nextHistory = commit(history, {
      type: 'add-overlay',
      text: copiedOverlay.text,
      x: clamp(copiedOverlay.x + 0.04, 0.05, 0.95),
      y: clamp(copiedOverlay.y + 0.04, 0.05, 0.95),
      fontSize: copiedOverlay.fontSize,
      fontFamily: copiedOverlay.fontFamily,
      color: copiedOverlay.color,
      backgroundOpacity: copiedOverlay.backgroundOpacity,
    })
    const nextOverlayId = nextHistory.present.overlays.at(-1)?.id ?? null
    setHistory(nextHistory)
    setSelectedOverlayId(nextOverlayId)
    setEditingOverlayId(null)
    setEditingOverlayText('')
  }, [copiedOverlay, history])

  const deleteSelectedOverlay = useCallback(() => {
    if (!selectedOverlayId || editingOverlayId) {
      return
    }

    deleteOverlay(selectedOverlayId)
  }, [deleteOverlay, editingOverlayId, selectedOverlayId])

  useEffect(() => {
    if (!editingOverlayId) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const editor = editingOverlayEditorRef.current
      if (editor?.contains(event.target as Node)) {
        return
      }

      commitOverlayText(editingOverlayId, editingOverlayText)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [commitOverlayText, editingOverlayId, editingOverlayText])

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
  }, [isPlaying, maxOutputDurationMs, playheadMs, project.clip])

  const togglePreviewMute = useCallback(() => {
    if (!hasControllableAudio) {
      return
    }

    if (previewVolumePct === 0) {
      setPreviewVolumePct(Math.max(1, lastNonZeroVolumePctRef.current))
      return
    }

    lastNonZeroVolumePctRef.current = previewVolumePct
    setPreviewVolumePct(0)
  }, [hasControllableAudio, previewVolumePct])

  useEffect(() => {
    const video = videoRef.current
    if (!video || project.source?.kind !== 'video') {
      return
    }

    const previewGain = previewVolumePct / 100

    if (!hasControllableAudio) {
      // Keep native volume fallback active so false-negative audio detection does not break control.
      video.volume = Math.min(1, previewGain)
      return
    }

    const setupAudio = async () => {
      if (typeof AudioContext === 'undefined') {
        video.volume = Math.min(1, previewGain)
        return
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain()
      }

      if (!mediaSourceNodeRef.current) {
        mediaSourceNodeRef.current = audioContextRef.current.createMediaElementSource(video)
        mediaSourceNodeRef.current.connect(gainNodeRef.current)
        gainNodeRef.current.connect(audioContextRef.current.destination)
      }

      gainNodeRef.current.gain.value = previewGain
      video.volume = 1
    }

    void setupAudio().catch(() => {
      // If WebAudio graph setup fails for this source/browser, fall back to native volume control.
      video.volume = Math.min(1, previewGain)
    })
  }, [hasControllableAudio, previewVolumePct, project.source?.kind])

  useEffect(
    () => () => {
      mediaSourceNodeRef.current?.disconnect()
      gainNodeRef.current?.disconnect()
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close()
      }
    },
    [],
  )

  useEffect(() => {
    let mounted = true

    loadDraft()
      .then((draft) => {
        if (!mounted || !draft) {
          return
        }

        setHistory(createHistory(applyCommand(createEmptyProject(), { type: 'hydrate', project: draft })))
      })
      .catch(() => {
        if (mounted) {
          setStatus('No previous draft was restored.')
        }
      })
      .finally(() => {
        if (mounted) {
          setIsBusy(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!project.source) {
      return
    }

    saveDraft(project).catch(() => {
        setStatus('Draft save failed in this session.')
    })
  }, [project])

  const renderAt = useCallback(
    async (timeMs: number) => {
      if (!canvasRef.current || !project.source) {
        return
      }

      let sourceImageFrame: VideoFrame | null = null
      if (
        project.source.kind === 'animated-image' &&
        animatedImageDecoderRef.current &&
        animatedImageTimelineRef.current
      ) {
        const sourceTimeMs = mapOutputTimeToSourceTime(project, timeMs)
        const frameIndex = pickAnimatedFrameIndex(
          animatedImageTimelineRef.current.cumulativeDurationsMs,
          sourceTimeMs,
          animatedImageTimelineRef.current.totalDurationMs,
        )
        const decoded = await animatedImageDecoderRef.current.decode({
          frameIndex,
          completeFramesOnly: true,
        })
        sourceImageFrame = decoded.image
      }

      try {
        await drawProjectFrame({
          canvas: canvasRef.current,
          project,
          sourceVideo: videoRef.current,
          sourceImage: imageRef.current,
          sourceImageFrame,
          outputTimeMs: timeMs,
          renderOverlay: false,
        })
      } finally {
        sourceImageFrame?.close()
      }
    },
    [project],
  )

  const calculateOverlayPosition = useCallback((clientX: number, clientY: number) => {
    const previewFrame = previewFrameRef.current
    if (!previewFrame) {
      return null
    }

    const rect = previewFrame.getBoundingClientRect()
    const x = clamp((clientX - rect.left) / rect.width, 0.05, 0.95)
    const y = clamp((clientY - rect.top) / rect.height, 0.05, 0.95)
    return { x, y }
  }, [])

  useEffect(() => {
    let cancelled = false

    const resetAnimatedImageDecoder = () => {
      animatedImageDecoderRef.current?.close()
      animatedImageDecoderRef.current = null
      animatedImageTimelineRef.current = null
    }

    if (project.source?.kind !== 'animated-image') {
      resetAnimatedImageDecoder()
      return
    }

    if (typeof ImageDecoder === 'undefined') {
      resetAnimatedImageDecoder()
      return
    }

    const source = project.source
    if (!source || source.kind !== 'animated-image') {
      return
    }

    const initializeAnimatedImageDecoder = async () => {
      try {
        const mimeType = source.mimeType || 'image/gif'
        const supported = await ImageDecoder.isTypeSupported(mimeType)
        if (!supported || cancelled) {
          return
        }

        const response = await fetch(source.objectUrl)
        if (!response.ok || cancelled) {
          return
        }

        const bytes = await response.arrayBuffer()
        if (cancelled) {
          return
        }

        resetAnimatedImageDecoder()
        const decoder = new ImageDecoder({
          type: mimeType,
          data: bytes,
          preferAnimation: true,
        })
        await decoder.tracks.ready
        if (cancelled) {
          decoder.close()
          return
        }

        const track = decoder.tracks.selectedTrack
        const frameCount = track?.frameCount ?? 0
        if (!track || frameCount < 1) {
          decoder.close()
          return
        }

        const cumulativeDurationsMs: number[] = []
        let totalDurationMs = 0
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          const decoded = await decoder.decode({
            frameIndex,
            completeFramesOnly: true,
          })
          const frameDurationMs = Math.max(16, Math.round((decoded.image.duration ?? 100_000) / 1000))
          totalDurationMs += frameDurationMs
          cumulativeDurationsMs.push(totalDurationMs)
          decoded.image.close()
        }

        if (cancelled) {
          decoder.close()
          return
        }

        animatedImageDecoderRef.current = decoder
        animatedImageTimelineRef.current = {
          totalDurationMs: Math.max(1, totalDurationMs),
          cumulativeDurationsMs,
        }
      } catch {
        resetAnimatedImageDecoder()
      }
    }

    void initializeAnimatedImageDecoder()

    return () => {
      cancelled = true
      resetAnimatedImageDecoder()
    }
  }, [project.source])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const overlayId = draggingOverlayIdRef.current
      if (overlayId) {
        const position = calculateOverlayPosition(event.clientX, event.clientY)
        if (position) {
          setDragOverlayPosition({ id: overlayId, ...position })
        }
      }

      const resizeState = resizingOverlayRef.current
      if (resizeState) {
        const deltaX = event.clientX - resizeState.startClientX
        const deltaY = event.clientY - resizeState.startClientY
        const nextFontSize = Math.max(12, resizeState.startFontSize + (deltaX + deltaY) * 0.08)
        setResizeOverlayFontSize({ id: resizeState.id, fontSize: nextFontSize })
      }
    }

    const handlePointerUp = () => {
      const overlayId = draggingOverlayIdRef.current
      if (overlayId) {
        draggingOverlayIdRef.current = null
        if (dragOverlayPosition && dragOverlayPosition.id === overlayId) {
          runCommand({
            type: 'set-overlay-position',
            overlayId,
            x: dragOverlayPosition.x,
            y: dragOverlayPosition.y,
          })
        }
        setDragOverlayPosition(null)
      }

      const resizeState = resizingOverlayRef.current
      if (resizeState) {
        resizingOverlayRef.current = null
        if (resizeOverlayFontSize && resizeOverlayFontSize.id === resizeState.id) {
          runCommand({
            type: 'set-overlay-font-size',
            overlayId: resizeState.id,
            fontSize: resizeOverlayFontSize.fontSize,
          })
        }
        setResizeOverlayFontSize(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [calculateOverlayPosition, dragOverlayPosition, resizeOverlayFontSize, runCommand])

  useEffect(() => {
    const video = videoRef.current
    if (!video || isPlaying || project.source?.kind !== 'video' || !project.clip) {
      return
    }

    video.playbackRate = project.clip.playbackRate
    video.currentTime = getVideoPreviewSourceTimeMs(playheadMs) / 1000
  }, [getVideoPreviewSourceTimeMs, isPlaying, playheadMs, project])

  useEffect(() => {
    if (!project.source || isBusy || project.source.kind === 'video') {
      return
    }

    renderAt(playheadMs).catch(() => {
      setStatus('Preview rendering failed for the current frame.')
    })
  }, [isBusy, playheadMs, project, renderAt])

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
      video.currentTime = getVideoPreviewSourceTimeMs(playheadRef.current) / 1000

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
        setPlayheadMs(mapSourceTimeToOutputTime(project, sourceTimeMs))

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
  }, [getVideoPreviewSourceTimeMs, isPlaying, project])

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }

      setIsBusy(true)
      setStatus(`Importing ${file.name}...`)

      try {
        const source = await extractSourceMedia(file)
        runCommand({ type: 'set-source', source })
        setPlayheadMs(0)
        setStatus(`Imported ${source.name}. You can now trim, caption, and export.`)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Import failed.')
      } finally {
        setIsBusy(false)
      }
    },
    [runCommand],
  )

  const handleExport = useCallback(async () => {
    if (!project.source || !project.clip || !canvasRef.current) {
      return
    }

    setIsExporting(true)
    setExportProgressPct(0)
    setIsPlaying(false)
    setStatus(`Exporting ${project.source.name} as ${project.exportPreset.format.toUpperCase()}...`)

    try {
      const preset = project.exportPreset
      const handleExportProgress = ({ phase, fraction }: ExportProgress) => {
        const clamped = Math.min(1, Math.max(0, fraction))
        if (phase === 'render') {
          setExportProgressPct(Math.max(3, Math.round(clamped * 70)))
          return
        }

        if (phase === 'transcode') {
          setExportProgressPct(Math.max(70, Math.round(70 + clamped * 30)))
          return
        }

        setExportProgressPct(100)
      }

      const result =
        project.source.kind === 'video'
          ? await exportVideoProjectToWebM({
              canvas: canvasRef.current,
              sourceUrl: project.source.objectUrl,
              trimStartMs: project.clip.trimStartMs,
              trimEndMs: project.clip.trimEndMs,
              playbackRate: project.clip.playbackRate,
              exportVolumeGain: hasControllableAudio ? previewVolumePct / 100 : 1,
              preset,
              onProgress: handleExportProgress,
              renderFrame: async (video) => {
                await drawProjectFrame({
                  canvas: canvasRef.current!,
                  project,
                  sourceVideo: video,
                  sourceImage: null,
                  outputTimeMs: 0,
                  seek: false,
                })
              },
            })
          : await exportPreviewToWebM({
              canvas: canvasRef.current,
              durationMs: projectReadableDuration(project),
              preset,
              onProgress: handleExportProgress,
              drawFrame: async (timeMs) => {
                let sourceImageFrame: VideoFrame | null = null
                if (
                  project.source?.kind === 'animated-image' &&
                  animatedImageDecoderRef.current &&
                  animatedImageTimelineRef.current
                ) {
                  const sourceTimeMs = mapOutputTimeToSourceTime(project, timeMs)
                  const frameIndex = pickAnimatedFrameIndex(
                    animatedImageTimelineRef.current.cumulativeDurationsMs,
                    sourceTimeMs,
                    animatedImageTimelineRef.current.totalDurationMs,
                  )
                  const decoded = await animatedImageDecoderRef.current.decode({
                    frameIndex,
                    completeFramesOnly: true,
                  })
                  sourceImageFrame = decoded.image
                }

                try {
                  await drawProjectFrame({
                    canvas: canvasRef.current!,
                    project,
                    sourceVideo: videoRef.current,
                    sourceImage: imageRef.current,
                    sourceImageFrame,
                    outputTimeMs: timeMs,
                  })
                } finally {
                  sourceImageFrame?.close()
                }
              },
            })

      downloadBlob(result)
      const summary = createProjectSummary(project)
      if (result.outputFormat !== result.requestedFormat) {
        setStatus(
          `Exported ${summary.source} (${formatDuration(summary.durationMs)} at ${summary.playbackRate}x) as ${result.outputFormat.toUpperCase()} because ${result.requestedFormat.toUpperCase()} is not yet available in this browser.`,
        )
      } else {
        setStatus(
          `Exported ${summary.source} (${formatDuration(summary.durationMs)} at ${summary.playbackRate}x) as ${result.outputFormat.toUpperCase()}.`,
        )
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setExportProgressPct(0)
      setIsExporting(false)
    }
  }, [hasControllableAudio, previewVolumePct, project])

  useKeyboardShortcuts({
    onTogglePlayback: togglePlayback,
    onUndo: () => setHistory((currentHistory) => undo(currentHistory)),
    onRedo: () => setHistory((currentHistory) => redo(currentHistory)),
    onExport: () => {
      void handleExport()
    },
    onCopy: copySelectedOverlay,
    onPaste: pasteOverlay,
    onDeleteSelected: deleteSelectedOverlay,
  })

  return (
    <main className="app-shell">
      <section className="hero-section">
        <div>
          <p className="eyebrow">Free · Private · Secure · Open source</p>
          <h1>trimmr</h1>
          <p className="lede">
            Edit your videos in seconds. Your files never leave your computer—trim,
            caption, speed up or slow down, then export or convert to other video file formats (WebM, MP4,
            and more) when you are ready, with no upload and no account, totally for free!
          </p>
        </div>
        <div className="hero-actions">
          <label className="file-picker">
            <span>Choose a file</span>
            <input
              type="file"
              accept="video/mp4,video/webm,image/gif,image/webp,image/apng,.apng"
              onChange={handleImport}
            />
          </label>
        </div>
      </section>

      <section className="editor-grid">
        <div className="editor-preview-centered">
        <Panel title="Editor">
          <div ref={previewFrameRef} className="preview-frame">
            <canvas
              ref={canvasRef}
              className={`preview-canvas ${project.source?.kind === 'video' ? 'is-hidden' : ''}`}
            />
            {project.source?.kind === 'video' ? (
              <>
                <video
                  ref={videoRef}
                  src={project.source.objectUrl}
                  playsInline
                  preload="metadata"
                  className="preview-video"
                />
              </>
            ) : null}
            {project.source?.kind === 'animated-image' ? (
              <img ref={imageRef} src={project.source.objectUrl} alt="" hidden />
            ) : null}
            <button
              className="preview-history-button preview-history-button-left"
              onClick={() => setHistory((currentHistory) => undo(currentHistory))}
              disabled={history.past.length === 0}
              aria-label="Undo"
              data-tooltip="Undo (Cmd+Z)"
              title="Undo (Cmd+Z)"
            >
              <span aria-hidden="true">↶</span>
            </button>
            <button
              className="preview-history-button preview-history-button-right"
              onClick={() => setHistory((currentHistory) => redo(currentHistory))}
              disabled={history.future.length === 0}
              aria-label="Redo"
              data-tooltip="Redo (Shift+Cmd+Z)"
              title="Redo (Shift+Cmd+Z)"
            >
              <span aria-hidden="true">↷</span>
            </button>
            <button
              className="preview-caption-button"
              onClick={handleAddOverlay}
              disabled={!project.clip}
              aria-label="Add caption"
              data-tooltip="Add caption"
              title="Add caption"
            >
              <span aria-hidden="true">+</span>
            </button>
            {project.overlays.map((overlay) => {
              const previewPosition =
                dragOverlayPosition?.id === overlay.id ? dragOverlayPosition : overlay
              const isEditing = editingOverlayId === overlay.id

              if (!overlay.text.trim() && !isEditing) {
                return null
              }

              return (
                <div
                  key={overlay.id}
                  className={`preview-overlay ${isEditing ? 'is-editing' : ''} ${selectedOverlayId === overlay.id ? 'is-selected' : ''}`}
                  style={{
                    left: `${previewPosition.x * 100}%`,
                    top: `${previewPosition.y * 100}%`,
                    fontSize: `${(resizeOverlayFontSize?.id === overlay.id
                      ? resizeOverlayFontSize.fontSize
                      : overlay.fontSize)}px`,
                    color: overlay.color,
                    background: overlayBackgroundCss(overlay.backgroundOpacity),
                    fontFamily: overlay.fontFamily,
                  }}
                  onDoubleClick={() => startOverlayEdit(overlay.id, overlay.text)}
                  onPointerDown={(event) => {
                    if (isEditing) {
                      return
                    }

                    setSelectedOverlayId(overlay.id)
                    draggingOverlayIdRef.current = overlay.id
                    const position = calculateOverlayPosition(event.clientX, event.clientY)
                    if (position) {
                      setDragOverlayPosition({ id: overlay.id, ...position })
                    }
                  }}
                >
                  {isEditing ? (
                    <div
                      ref={isEditing ? editingOverlayEditorRef : null}
                      className="preview-overlay-editor"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <input
                        className="preview-overlay-input"
                        value={editingOverlayText}
                        onChange={(event) => setEditingOverlayText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitOverlayText(overlay.id, editingOverlayText)
                          }

                          if (event.key === 'Escape') {
                            closeOverlayEdit()
                          }
                        }}
                        placeholder="Caption text"
                        autoFocus
                      />
                      <div className="preview-overlay-style-row">
                        <label className="preview-overlay-style-field">
                          <span>Text</span>
                          <input
                            type="color"
                            value={overlay.color}
                            onChange={(event) =>
                              updateOverlayStyle(overlay.id, { color: event.target.value })
                            }
                          />
                        </label>
                        <label className="preview-overlay-style-field">
                          <span>Font</span>
                          <select
                            value={overlay.fontFamily}
                            onChange={(event) =>
                              updateOverlayStyle(overlay.id, { fontFamily: event.target.value })
                            }
                          >
                            {FONT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="preview-overlay-style-field preview-overlay-style-field-range">
                        <span>Background</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={overlay.backgroundOpacity}
                          onChange={(event) =>
                            updateOverlayStyle(overlay.id, {
                              backgroundOpacity: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        className="preview-overlay-done-button"
                        onClick={() => commitOverlayText(overlay.id, editingOverlayText)}
                      >
                        Done
                      </button>
                      <button
                        className="preview-overlay-delete-button"
                        onClick={() => deleteOverlay(overlay.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <>
                      {overlay.text}
                      <button
                        className="preview-overlay-resize-corner"
                        aria-label="Resize caption"
                        title="Resize caption"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          resizingOverlayRef.current = {
                            id: overlay.id,
                            startClientX: event.clientX,
                            startClientY: event.clientY,
                            startFontSize:
                              resizeOverlayFontSize?.id === overlay.id
                                ? resizeOverlayFontSize.fontSize
                                : overlay.fontSize,
                          }
                          setResizeOverlayFontSize({
                            id: overlay.id,
                            fontSize:
                              resizeOverlayFontSize?.id === overlay.id
                                ? resizeOverlayFontSize.fontSize
                                : overlay.fontSize,
                          })
                        }}
                      />
                    </>
                  )}
                </div>
              )
            })}
            <div className="trim-editor" aria-label="Trim controls">
              <div className="trim-labels">
                <span>Start {formatDuration(trimStartMs)}</span>
                <span>End {formatDuration(trimEndMs)}</span>
        </div>
              <div className="trim-slider-wrap">
                <div className="trim-track" />
                <div
                  className="trim-selection"
                  style={{
                    left: toTimelinePercent(trimStartMs),
                    right: `${100 - (trimEndMs / timelineDenominator) * 100}%`,
                  }}
                />
                <div
                  className="trim-playhead"
                  style={{
                    left: toTimelinePercent(playheadSourceMs),
                  }}
                />
                <div
                  className="trim-handle trim-handle-start"
                  style={{
                    left: toTimelinePercent(trimStartMs),
                  }}
                  aria-hidden="true"
                >
                  [
                </div>
                <div
                  className="trim-handle trim-handle-end"
                  style={{
                    left: toTimelinePercent(trimEndMs),
                  }}
                  aria-hidden="true"
                >
                  ]
                </div>
                <input
                  className="trim-slider trim-slider-playhead"
                  type="range"
                  min={0}
                  max={Math.max(0, maxOutputDurationMs)}
                  step={10}
                  value={Math.min(playheadMs, maxOutputDurationMs)}
                  onChange={(event) => setPlayheadMs(Number(event.target.value))}
                  disabled={!project.clip}
                  aria-label="Playhead"
                  title="Move playhead"
                />
                <input
                  className="trim-slider trim-slider-start"
                  type="range"
                  min={0}
                  max={maxTimelineMs}
                  step={10}
                  value={trimStartMs}
                  onChange={(event) => updateTrim({ trimStartMs: Number(event.target.value) })}
                  disabled={!project.clip}
                  aria-label="Trim start"
                  title="Adjust trim start"
                />
                <input
                  className="trim-slider trim-slider-end"
                  type="range"
                  min={0}
                  max={maxTimelineMs}
                  step={10}
                  value={trimEndMs}
                  onChange={(event) => updateTrim({ trimEndMs: Number(event.target.value) })}
                  disabled={!project.clip}
                  aria-label="Trim end"
                  title="Adjust trim end"
                />
              </div>
              <div className="trim-controls">
                <button
                  className="video-play-button"
                  onClick={togglePlayback}
                  disabled={!project.clip}
                  aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
                >
                  <span className="video-play-icon" aria-hidden="true">
                    {isPlaying ? '||' : '▶'}
                  </span>
                </button>
                <label
                  className={`trim-volume ${isVolumeInteracting ? 'is-active' : ''} ${hasControllableAudio ? '' : 'is-disabled'}`}
                  aria-label="Volume control"
                >
                  <button
                    type="button"
                    className="trim-volume-icon"
                    disabled={!hasControllableAudio}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      togglePreviewMute()
                    }}
                    aria-label={
                      hasControllableAudio
                        ? previewVolumePct === 0
                          ? 'Unmute'
                          : 'Mute'
                        : 'No audio track'
                    }
                  >
                    <VolumeIcon
                      hasControllableAudio={hasControllableAudio}
                      previewVolumePct={previewVolumePct}
                    />
                  </button>
                  <input
                    className="trim-volume-slider"
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={previewVolumePct}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setPreviewVolumePct(next)
                      if (next > 0) {
                        lastNonZeroVolumePctRef.current = next
                      }
                    }}
                    onPointerDown={() => setIsVolumeInteracting(true)}
                    onPointerUp={() => setIsVolumeInteracting(false)}
                    onPointerCancel={() => setIsVolumeInteracting(false)}
                    onFocus={() => setIsVolumeInteracting(true)}
                    onBlur={() => setIsVolumeInteracting(false)}
                    disabled={!hasControllableAudio}
                    aria-label="Volume"
                    title={hasControllableAudio ? 'Volume' : 'No audio track available'}
                  />
                  <span className="trim-volume-percent">{previewVolumePct}%</span>
                  <span className="trim-current-time trim-current-time-inline">
                    {formatDuration(Math.min(playheadMs, maxOutputDurationMs))} / {snapshot.endLabel}
                  </span>
                </label>
              </div>
            </div>
          </div>
          <div className="preview-settings">
            <RangeField
              label="Playback speed"
              min={0.25}
              max={2}
              step={0.05}
              value={project.clip?.playbackRate ?? 1}
              hint={`${project.clip?.playbackRate ?? 1}x`}
              onChange={(event) =>
                runCommand({
                  type: 'set-playback-rate',
                  playbackRate: Number(event.target.value),
                })
              }
            />
          </div>
          <div className="preview-export-row">
            <div className="preview-export-toolbar">
              <div className="preview-export-select-field">
                <Field label="Format">
                  <select
                    value={project.exportPreset.format}
                    onChange={(event) =>
                      runCommand({
                        type: 'set-export-format',
                        format: event.target.value as 'webm' | 'mp4' | 'gif' | 'animated-webp',
                      })
                    }
                  >
                    <option value="webm">WebM</option>
                    <option value="mp4">MP4</option>
                    <option value="gif">GIF</option>
                    <option value="animated-webp">Animated WebP</option>
                  </select>
                </Field>
              </div>
              <div className="preview-export-select-field">
                <Field label="Dimensions">
                  <select
                    value={`${project.exportPreset.width}x${project.exportPreset.height}`}
                    onChange={(event) => {
                      const { width, height } = parseExportCanvasSize(event.target.value)
                      runCommand({ type: 'set-export-size', width, height })
                    }}
                  >
                    {EXPORT_CANVAS_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                    {!exportCanvasMatchesPreset(
                      project.exportPreset.width,
                      project.exportPreset.height,
                    ) ? (
                      <option
                        value={`${project.exportPreset.width}x${project.exportPreset.height}`}
                      >
                        Custom — {project.exportPreset.width} × {project.exportPreset.height}
                      </option>
                    ) : null}
                  </select>
                </Field>
              </div>
              <PrimaryButton onClick={() => void handleExport()} disabled={!project.clip || isExporting}>
                {isExporting ? 'Exporting...' : 'Export'}
              </PrimaryButton>
            </div>
            {isExporting ? (
              <div
                className="export-progress"
                role="progressbar"
                aria-label="Export progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={exportProgressPct}
              >
                <span className="export-progress-bar" style={{ width: `${exportProgressPct}%` }} />
              </div>
            ) : null}
          </div>
        </Panel>
        </div>
      </section>

      <footer className="app-footer">
        <a href="/workflows/index.html">workflows</a>
      </footer>
    </main>
  )
}

export default App
