import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function Harness(props: {
  onTogglePlayback: () => void
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
  onCopy: () => void
  onPaste: () => void
  onDeleteSelected: () => void
}) {
  useKeyboardShortcuts(props)
  return <div>shortcuts</div>
}

describe('useKeyboardShortcuts', () => {
  it('fires playback, export, undo, and redo shortcuts', () => {
    const onTogglePlayback = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onExport = vi.fn()
    const onCopy = vi.fn()
    const onPaste = vi.fn()
    const onDeleteSelected = vi.fn()

    render(
      <Harness
        onTogglePlayback={onTogglePlayback}
        onUndo={onUndo}
        onRedo={onRedo}
        onExport={onExport}
        onCopy={onCopy}
        onPaste={onPaste}
        onDeleteSelected={onDeleteSelected}
      />,
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

    expect(onTogglePlayback).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(2)
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onDeleteSelected).toHaveBeenCalledTimes(1)
  })

  it('fires delete for both Delete and Backspace keys', () => {
    const onDeleteSelected = vi.fn()

    render(
      <Harness
        onTogglePlayback={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onExport={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onDeleteSelected={onDeleteSelected}
      />,
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))

    expect(onDeleteSelected).toHaveBeenCalledTimes(2)
  })

  it('ignores keystrokes coming from editable targets and cleans up on unmount', () => {
    const onTogglePlayback = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onExport = vi.fn()
    const onCopy = vi.fn()
    const onPaste = vi.fn()
    const onDeleteSelected = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <Harness
        onTogglePlayback={onTogglePlayback}
        onUndo={onUndo}
        onRedo={onRedo}
        onExport={onExport}
        onCopy={onCopy}
        onPaste={onPaste}
        onDeleteSelected={onDeleteSelected}
      />,
    )

    const input = document.createElement('input')
    const inputEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true })
    Object.defineProperty(inputEvent, 'target', { value: input })
    input.dispatchEvent(inputEvent)

    const textarea = document.createElement('textarea')
    const textareaEvent = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })
    Object.defineProperty(textareaEvent, 'target', { value: textarea })
    textarea.dispatchEvent(textareaEvent)

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    const editableEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
    Object.defineProperty(editableEvent, 'target', { value: editable })
    editable.dispatchEvent(editableEvent)

    expect(onTogglePlayback).not.toHaveBeenCalled()
    expect(onExport).not.toHaveBeenCalled()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
    expect(onPaste).not.toHaveBeenCalled()
    expect(onDeleteSelected).not.toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
