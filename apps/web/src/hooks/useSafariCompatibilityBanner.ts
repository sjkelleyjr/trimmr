import { useCallback, useMemo, useState } from 'react'
import type { EditorProject } from '@trimmr/shared'
import {
  getSafariSpecificCompatibilityWarning,
  SAFARI_COMPATIBILITY_BASE_WARNING,
} from '../lib/safariCompatibility'

const SAFARI_BANNER_DISMISSALS_STORAGE_KEY = 'trimmr_safari_banner_dismissals_v1'

function sourceBannerDismissKey(source: NonNullable<EditorProject['source']>): string {
  return [
    source.kind,
    source.name,
    source.mimeType,
    source.fileSizeBytes,
    source.durationMs,
    source.width,
    source.height,
  ].join('|')
}

function importBannerDismissKey(input: {
  kind: 'video' | 'animated-image'
  name: string
  mimeType: string
  fileSizeBytes: number
}): string {
  return [input.kind, input.name, input.mimeType, input.fileSizeBytes].join('|')
}

function loadDismissedFromStorage(): Record<string, true> {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(SAFARI_BANNER_DISMISSALS_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, true> | null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function useSafariCompatibilityBanner({
  source,
  pendingImport,
  isWebKit,
}: {
  source: EditorProject['source']
  pendingImport: {
    kind: 'video' | 'animated-image'
    name: string
    mimeType: string
    fileSizeBytes: number
  } | null
  isWebKit: boolean
}) {
  const [dismissedSafariBannerBySourceId, setDismissedSafariBannerBySourceId] = useState<
    Record<string, true>
  >(loadDismissedFromStorage)

  const sourceDismissKey = useMemo(() => {
    if (source) {
      return sourceBannerDismissKey(source)
    }
    if (pendingImport) {
      return importBannerDismissKey(pendingImport)
    }
    return null
  }, [source, pendingImport])

  const safariSpecificCompatibilityWarning = getSafariSpecificCompatibilityWarning(source, isWebKit)
  const safariCompatibilityBannerText =
    isWebKit && (source || pendingImport)
      ? safariSpecificCompatibilityWarning ?? SAFARI_COMPATIBILITY_BASE_WARNING
      : null
  const showSafariCompatibilityBanner =
    Boolean(safariCompatibilityBannerText) &&
    Boolean(sourceDismissKey) &&
    (sourceDismissKey ? !dismissedSafariBannerBySourceId[sourceDismissKey] : false)

  const dismissSafariBanner = useCallback(() => {
    if (!sourceDismissKey) {
      return
    }
    setDismissedSafariBannerBySourceId((prev) => {
      const next: Record<string, true> = { ...prev, [sourceDismissKey]: true }
      try {
        window.localStorage.setItem(SAFARI_BANNER_DISMISSALS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [sourceDismissKey])

  return {
    safariCompatibilityBannerText,
    showSafariCompatibilityBanner,
    sourceDismissKey,
    dismissSafariBanner,
  }
}
