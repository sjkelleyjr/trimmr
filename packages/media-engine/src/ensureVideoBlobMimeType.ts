/**
 * Blobs from IndexedDB `fetch(blob:)` or `XHR` often lose MIME metadata (`type` is empty).
 * Safari relies on a concrete type when using `HTMLMediaElement.srcObject` for reliable audio.
 */
export function ensureVideoBlobMimeType(blob: Blob, fileName: string, mimeType: string): Blob {
  const mime = mimeType.trim() || 'video/mp4'
  if (blob.type && blob.type !== 'application/octet-stream') {
    return blob
  }
  return new File([blob], fileName, { type: mime })
}
