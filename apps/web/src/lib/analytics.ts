import type { ExportFormat, SupportedImportFormat } from '@trimmr/shared'

type AnalyticsClient = {
  capture: (eventName: string, properties?: Record<string, string | number | boolean | null>) => void
  register_for_session?: (properties: Record<string, string | number | boolean>) => void
} | null | undefined

type FeatureName = 'trim' | 'playback_rate' | 'overlay'

export function captureEvent(
  client: AnalyticsClient,
  eventName: string,
  properties?: Record<string, string | number | boolean | null>,
) {
  client?.capture(eventName, properties)
}

/** Merges into all events for the current PostHog session (tab lifetime). */
export function registerSessionProperties(
  client: AnalyticsClient,
  properties: Record<string, string | number | boolean>,
) {
  client?.register_for_session?.(properties)
}

export function captureFeatureUsed(client: AnalyticsClient, feature: FeatureName) {
  captureEvent(client, 'feature_used', { feature })
}

export function captureExportStarted(
  client: AnalyticsClient,
  requestedFormat: ExportFormat,
  sourceFormat: SupportedImportFormat | 'unknown',
) {
  captureEvent(client, 'export_started', {
    requested_format: requestedFormat,
    source_format: sourceFormat,
  })
}

export function captureExportSucceeded(
  client: AnalyticsClient,
  requestedFormat: ExportFormat,
  outputFormat: ExportFormat,
  sourceFormat: SupportedImportFormat | 'unknown',
  durationMs: number,
) {
  captureEvent(client, 'export_succeeded', {
    requested_format: requestedFormat,
    output_format: outputFormat,
    source_format: sourceFormat,
    duration_ms: durationMs,
  })
}

export function captureExportFailed(
  client: AnalyticsClient,
  requestedFormat: ExportFormat,
  sourceFormat: SupportedImportFormat | 'unknown',
  reason: string,
) {
  captureEvent(client, 'export_failed', {
    requested_format: requestedFormat,
    source_format: sourceFormat,
    reason,
  })
}
