import { describe, expect, it } from 'vitest'
import { classifyExportError, classifyImportError } from './errorTaxonomy'

describe('errorTaxonomy', () => {
  it('classifies import metadata failures', () => {
    const classified = classifyImportError(new Error('Unable to load video metadata'))
    expect(classified.code).toBe('SourceMetadataLoadFailed')
    expect(classified.recoveryStrategy).toBe('ConvertSourceBeforeImport')
  })

  it('classifies mediarecorder init failures', () => {
    const classified = classifyExportError(new Error('Could not create MediaRecorder: NotSupportedError'))
    expect(classified.code).toBe('RecorderInitFailed')
    expect(classified.recoveryStrategy).toBe('ReloadSession')
  })

  it('classifies transcode failures', () => {
    const classified = classifyExportError(new Error('Failed to transcode export to MP4.'))
    expect(classified.code).toBe('ExportTranscodeFailed')
    expect(classified.recoveryStrategy).toBe('ReportIssue')
  })
})
