import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, createSourceMedia } from './test/factories'

const mediaEngineMocks = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  loadFfmpeg: vi.fn(),
  extractSourceMedia: vi.fn(),
  exportPreviewToWebM: vi.fn(),
  exportVideoProjectToWebM: vi.fn(),
  downloadBlob: vi.fn(),
  createProjectSummary: vi.fn(),
  isWebKitExportUserAgent: vi.fn(() => false),
}))

const renderMocks = vi.hoisted(() => ({
  drawProjectFrame: vi.fn(),
  exportAspectRatioCss: vi.fn(
    (preset: { width: number; height: number }) => `${preset.width} / ${preset.height}`,
  ),
  mapSourceTimeToOutputTime: vi.fn(() => 0),
  mapOutputTimeToSourceTime: vi.fn(() => 0),
  projectReadableDuration: vi.fn(() => 1000),
}))

vi.mock('@trimmr/media-engine', () => mediaEngineMocks)
vi.mock('./lib/renderProjectFrame', () => renderMocks)

import App from './App'

describe('App', () => {
  beforeEach(() => {
    mediaEngineMocks.loadDraft.mockResolvedValue(null)
    mediaEngineMocks.saveDraft.mockResolvedValue(undefined)
    mediaEngineMocks.loadFfmpeg.mockResolvedValue(undefined as never)
    mediaEngineMocks.extractSourceMedia.mockResolvedValue(createSourceMedia())
    mediaEngineMocks.exportPreviewToWebM.mockResolvedValue({
      blob: new Blob(['export']),
      filename: 'export.webm',
      mimeType: 'video/webm',
      requestedFormat: 'webm',
      outputFormat: 'webm',
    })
    mediaEngineMocks.exportVideoProjectToWebM.mockResolvedValue({
      blob: new Blob(['export']),
      filename: 'export.webm',
      mimeType: 'video/webm',
      requestedFormat: 'webm',
      outputFormat: 'webm',
    })
    mediaEngineMocks.downloadBlob.mockImplementation(() => {})
    mediaEngineMocks.createProjectSummary.mockReturnValue({
      source: 'clip.mp4',
      durationMs: 4000,
      playbackRate: 1,
      exportFormat: 'webm',
    })
    renderMocks.drawProjectFrame.mockResolvedValue(undefined)
  })

  it('restores a draft on startup', async () => {
    const draft = createProject()
    draft.overlays[0]!.text = 'Saved caption'
    mediaEngineMocks.loadDraft.mockResolvedValue(draft)

    render(<App />)

    await screen.findByText('Saved caption')
  })

  it('imports media, updates the editor state, and exports', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]')

    expect(fileInput).not.toBeNull()
    await user.upload(fileInput! as HTMLInputElement, new File(['video'], 'demo.mp4', { type: 'video/mp4' }))

    await waitFor(() => {
      expect(mediaEngineMocks.extractSourceMedia).toHaveBeenCalled()
    })
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Dimensions')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add caption' }))
    const captionField = await screen.findByPlaceholderText('Caption text')
    await user.type(captionField, 'Open source quality')
    await user.tab()

    const exportButton = screen.getByRole('button', { name: 'Export' })
    await user.click(exportButton)

    await waitFor(() => {
      expect(mediaEngineMocks.exportVideoProjectToWebM).toHaveBeenCalled()
      expect(mediaEngineMocks.downloadBlob).toHaveBeenCalled()
    })

    // Regression: success status must be rendered (not only setState) so WebKit e2e can
    // assert export completion when Playwright does not emit a download event.
    await waitFor(() => {
      expect(screen.getByText(/Exported clip\.mp4.*as WEBM/i)).toBeInTheDocument()
    })

    await waitFor(
      () => {
        expect(mediaEngineMocks.saveDraft).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )
  }, 15_000)

  it('shows Safari compatibility banner after importing a GIF on Safari', async () => {
    mediaEngineMocks.isWebKitExportUserAgent.mockReturnValue(true)
    mediaEngineMocks.extractSourceMedia.mockResolvedValue(
      createSourceMedia({
        name: 'demo.gif',
        mimeType: 'image/gif',
        kind: 'animated-image',
        format: 'gif',
        audioTrackStatus: 'absent',
      }),
    )

    const user = userEvent.setup()
    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]')

    expect(fileInput).not.toBeNull()
    await user.upload(fileInput! as HTMLInputElement, new File(['gif'], 'demo.gif', { type: 'image/gif' }))

    await waitFor(() => {
      expect(mediaEngineMocks.extractSourceMedia).toHaveBeenCalled()
    })
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('shows Safari compatibility banner immediately while GIF metadata is still loading', async () => {
    mediaEngineMocks.isWebKitExportUserAgent.mockReturnValue(true)
    let resolveImport: (value: unknown) => void = () => {}
    mediaEngineMocks.extractSourceMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve
        }),
    )

    const user = userEvent.setup()
    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()

    await user.upload(fileInput! as HTMLInputElement, new File(['gif'], 'slow.gif', { type: 'image/gif' }))

    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(screen.getByText(/Safari compatibility warning/i)).toBeInTheDocument()

    resolveImport(
      createSourceMedia({
        name: 'slow.gif',
        mimeType: 'image/gif',
        kind: 'animated-image',
        format: 'gif',
        audioTrackStatus: 'absent',
      }),
    )

    await waitFor(() => {
      expect(mediaEngineMocks.extractSourceMedia).toHaveBeenCalled()
    })
  })
})
