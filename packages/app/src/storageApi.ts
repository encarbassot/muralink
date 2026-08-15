// Client for the NAS storage API (core /api/storage/*). Used by the file
// explorer and its virtual console.

import { api, API_TOKEN, API_ORIGIN } from './api/client.ts'

export interface StorageEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  ext: string
}

export interface ListResponse {
  root: string
  path: string
  entries: StorageEntry[]
}

export const storageApi = {
  list: (path?: string) =>
    api.get<ListResponse>('/storage/list', { params: path ? { path } : undefined }).then((r) => r.data),
  root: () => api.get<{ root: string }>('/storage/root').then((r) => r.data.root),
  upload: (dir: string, file: File) =>
    api.post('/storage/upload', file, {
      params: { dir, name: file.name },
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
  mkdir: (path: string) => api.post('/storage/mkdir', { path }),
  remove: (path: string) => api.post('/storage/delete', { path }),
  move: (from: string, to: string) => api.post('/storage/move', { from, to }),
  copy: (from: string, to: string) => api.post('/storage/copy', { from, to }),
  serveUrl: (path: string) =>
    `${API_ORIGIN}/api/storage/serve?path=${encodeURIComponent(path)}&token=${encodeURIComponent(API_TOKEN)}`,
  usage: () =>
    api.get<{ usedBytes: number; maxBytes: number | null }>('/storage/usage').then((r) => r.data),
  uploadResumable,
}

// ── Chunked resumable upload ───────────────────────────────────────────────
// Streams a file to /api/storage/upload/* in 8 MB slices. Resume is server-
// driven: init matches an existing part by (dir, name, size) and returns the
// offset already on disk, so a reload or dropped wifi continues where it left
// off. Dedup is advisory via sha256 (hashed client-side when the file is small
// enough to buffer; the server's lazy hash job covers the rest).

const CHUNK_SIZE = 8 * 1024 * 1024
const MAX_RETRIES = 3
// crypto.subtle.digest is one-shot (needs the whole buffer) — only hash files
// we can afford to hold in memory. Bigger files still dedup server-side later.
const HASH_LIMIT = 256 * 1024 * 1024

export interface UploadProgress {
  sent: number
  total: number
}

export interface UploadResult {
  ok: boolean
  path?: string
  duplicate?: { existingPath: string }
}

async function fileSha256(file: File): Promise<string | undefined> {
  if (file.size > HASH_LIMIT || !globalThis.crypto?.subtle) return undefined
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined
  }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

export async function uploadResumable(
  dir: string,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  const sha256 = await fileSha256(file)
  const init = await api.post<{ uploadId: string; offset: number }>('/storage/upload/init', {
    dir,
    name: file.name,
    size: file.size,
    mtimeMs: file.lastModified,
    sha256,
  }, { signal: opts.signal })
  const { uploadId } = init.data
  let offset = init.data.offset

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE)
    let attempt = 0
    let resynced = false
    for (;;) {
      try {
        await api.post(`/storage/upload/${uploadId}/chunk`, chunk, {
          params: { offset },
          headers: { 'Content-Type': 'application/octet-stream' },
          signal: opts.signal,
        })
        break
      } catch (e) {
        if (opts.signal?.aborted) throw e
        // Offset mismatch (a retried chunk already landed): adopt the server's
        // offset and re-slice from there instead of advancing blindly.
        const response = (e as { response?: { status?: number; data?: { offset?: number } } }).response
        if (response?.status === 409 && typeof response.data?.offset === 'number') {
          offset = response.data.offset
          resynced = true
          break
        }
        if (++attempt > MAX_RETRIES) throw e
        await sleep(1000 * 2 ** (attempt - 1))
      }
    }
    if (!resynced) offset = Math.min(offset + CHUNK_SIZE, file.size)
    opts.onProgress?.({ sent: offset, total: file.size })
  }

  const done = await api.post<UploadResult>(`/storage/upload/${uploadId}/complete`, { sha256 }, { signal: opts.signal })
  return done.data
}

// Join a directory path with a child name (server is posix).
export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`
}
