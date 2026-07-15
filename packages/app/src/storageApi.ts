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
}

// Join a directory path with a child name (server is posix).
export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`
}
