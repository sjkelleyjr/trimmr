import type { EditorProject, SourceMedia } from '@trimmr/shared'

const DB_NAME = 'trimmr'
const STORE_NAME = 'drafts'
const LATEST_DRAFT_KEY = 'latest'
const LATEST_SOURCE_BLOB_KEY = 'latest-source-blob'

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function serializeSourceBlob(source: SourceMedia | null) {
  if (!source || !source.objectUrl.startsWith('blob:') || typeof fetch !== 'function') {
    return null
  }

  try {
    const response = await fetch(source.objectUrl)
    if (!response.ok) {
      return null
    }

    return await response.blob()
  } catch {
    return null
  }
}

export async function saveDraft(project: EditorProject) {
  const db = await openDraftDb()
  const sourceBlob = await serializeSourceBlob(project.source)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put(project, LATEST_DRAFT_KEY)
    if (sourceBlob) {
      store.put(sourceBlob, LATEST_SOURCE_BLOB_KEY)
    } else {
      store.delete(LATEST_SOURCE_BLOB_KEY)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })

  db.close()
}

export async function loadDraft() {
  const db = await openDraftDb()
  const { project, sourceBlob } = await new Promise<{
    project: EditorProject | null
    sourceBlob: Blob | null
  }>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const projectRequest = store.get(LATEST_DRAFT_KEY)
    const sourceBlobRequest = store.get(LATEST_SOURCE_BLOB_KEY)
    let completed = 0

    const maybeResolve = () => {
      completed += 1
      if (completed === 2) {
        resolve({
          project: (projectRequest.result as EditorProject | undefined) ?? null,
          sourceBlob: (sourceBlobRequest.result as Blob | undefined) ?? null,
        })
      }
    }

    projectRequest.onsuccess = maybeResolve
    sourceBlobRequest.onsuccess = maybeResolve
    projectRequest.onerror = () => reject(projectRequest.error)
    sourceBlobRequest.onerror = () => reject(sourceBlobRequest.error)
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()

  if (!project) {
    return null
  }

  if (!project.source || !sourceBlob) {
    return project
  }

  return {
    ...project,
    source: {
      ...project.source,
      objectUrl: URL.createObjectURL(sourceBlob),
    },
  }
}
