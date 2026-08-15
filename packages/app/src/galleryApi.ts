// Client for the gallery API (core /api/gallery/*). Mirrors storageApi style:
// axios for JSON, ?token= URLs for <img>/<video> (they can't send headers).

import { api, API_TOKEN, API_ORIGIN } from './api/client.ts'
import type {
  YMediaItem,
  YMediaTag,
  YMediaPage,
  YMediaFilter,
  YGalleryStatus,
} from '@muralink/module-gallery/types'

export type { YMediaItem, YMediaTag, YMediaPage, YMediaFilter, YGalleryStatus }

export const galleryApi = {
  items: (filter: YMediaFilter = {}) =>
    api.get<YMediaPage>('/gallery/items', { params: filter }).then(r => r.data),
  item: (id: string) => api.get<YMediaItem>(`/gallery/items/${id}`).then(r => r.data),
  tags: (kind?: string) =>
    api.get<YMediaTag[]>('/gallery/tags', { params: kind ? { kind } : undefined }).then(r => r.data),
  addTag: (itemId: string, name: string, kind = 'user') =>
    api.post<YMediaTag>(`/gallery/items/${itemId}/tags`, { name, kind }).then(r => r.data),
  removeTag: (itemId: string, tagId: string) =>
    api.delete(`/gallery/items/${itemId}/tags/${tagId}`),
  scan: () => api.post<{ started: boolean }>('/gallery/scan').then(r => r.data),
  status: () => api.get<YGalleryStatus>('/gallery/status').then(r => r.data),
  thumbUrl: (id: string) =>
    `${API_ORIGIN}/api/gallery/items/${id}/thumb?token=${encodeURIComponent(API_TOKEN)}`,
  fileUrl: (id: string) =>
    `${API_ORIGIN}/api/gallery/items/${id}/file?token=${encodeURIComponent(API_TOKEN)}`,
}
