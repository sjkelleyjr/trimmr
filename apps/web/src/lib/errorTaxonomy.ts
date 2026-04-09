export type MediaErrorCode =
  | 'UnsupportedSource'
  | 'SourceMetadataLoadFailed'
  | 'RecorderInitFailed'
  | 'ExportSourceLoadFailed'
  | 'ExportSeekFailed'
  | 'ExportTranscodeFailed'
  | 'PlaybackStallTimeout'
  | 'UnknownFailure'

export type RecoveryStrategy =
  | 'TryDifferentSource'
  | 'ConvertSourceBeforeImport'
  | 'RetryExport'
  | 'LowerComplexityExport'
  | 'ReloadSession'
  | 'ReportIssue'

export interface ClassifiedMediaError {
  code: MediaErrorCode
  recoverable: boolean
  userMessage: string
  recoveryStrategy: RecoveryStrategy
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? '')
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function classifyImportError(error: unknown): ClassifiedMediaError {
  const msg = normalizeErrorMessage(error).toLowerCase()

  if (includesAny(msg, ['unable to load video metadata', 'unable to load image metadata'])) {
    return {
      code: 'SourceMetadataLoadFailed',
      recoverable: true,
      userMessage:
        'We could not read this file metadata. Try a different file or convert it to MP4/WebM first.',
      recoveryStrategy: 'ConvertSourceBeforeImport',
    }
  }

  return {
    code: 'UnsupportedSource',
    recoverable: true,
    userMessage: 'Import failed for this file. Try another source or convert it to MP4/WebM first.',
    recoveryStrategy: 'TryDifferentSource',
  }
}

export function classifyExportError(error: unknown): ClassifiedMediaError {
  const msg = normalizeErrorMessage(error).toLowerCase()

  if (includesAny(msg, ['could not create mediarecorder', 'mediarecorder'])) {
    return {
      code: 'RecorderInitFailed',
      recoverable: true,
      userMessage: 'This browser could not start export recording. Retry export or reload the page.',
      recoveryStrategy: 'ReloadSession',
    }
  }

  if (includesAny(msg, ['unable to load export video metadata'])) {
    return {
      code: 'ExportSourceLoadFailed',
      recoverable: true,
      userMessage: 'Export could not load the source stream. Try re-importing the file and exporting again.',
      recoveryStrategy: 'RetryExport',
    }
  }

  if (includesAny(msg, ['unable to seek export video'])) {
    return {
      code: 'ExportSeekFailed',
      recoverable: true,
      userMessage: 'Export seek failed during rendering. Retry export with a shorter trim range.',
      recoveryStrategy: 'LowerComplexityExport',
    }
  }

  if (includesAny(msg, ['failed to transcode export'])) {
    return {
      code: 'ExportTranscodeFailed',
      recoverable: true,
      userMessage: 'Export encoding failed. Retry export; if it keeps failing, report this issue.',
      recoveryStrategy: 'ReportIssue',
    }
  }

  if (includesAny(msg, ['timeout', 'stalled'])) {
    return {
      code: 'PlaybackStallTimeout',
      recoverable: true,
      userMessage: 'Export timed out while processing. Retry export or trim a shorter segment.',
      recoveryStrategy: 'LowerComplexityExport',
    }
  }

  return {
    code: 'UnknownFailure',
    recoverable: true,
    userMessage: 'Export failed. Retry export and report the issue if it persists.',
    recoveryStrategy: 'ReportIssue',
  }
}
