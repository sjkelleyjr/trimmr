import { useEffect } from 'react'

export function useKeyboardShortcuts({
  onTogglePlayback,
  onUndo,
  onRedo,
  onExport,
  onCopy,
  onPaste,
  onDeleteSelected,
}: {
  onTogglePlayback: () => void
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
  onCopy: () => void
  onPaste: () => void
  onDeleteSelected: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        onTogglePlayback()
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onExport()
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        onCopy()
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        onPaste()
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        onDeleteSelected()
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        onUndo()
      }

      if (
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') ||
        ((event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === 'z')
      ) {
        event.preventDefault()
        onRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCopy, onDeleteSelected, onExport, onPaste, onRedo, onTogglePlayback, onUndo])
}
