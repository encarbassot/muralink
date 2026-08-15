// gallery module types. A media item is an indexed file under the NAS root —
// the row in the gallery's SQLite index, not the bytes themselves. Tags are
// non-exclusive; `kind` separates user hashtags, people and named places
// within one mechanism.

import type { YFileRef, YGeoPoint, YMediaKind } from '@muralink/types'

export type YMediaTagKind = 'user' | 'person' | 'location'

export interface YMediaTag {
  id: string
  kind: YMediaTagKind
  // For 'user'/'location' this is the display name ("mountain", "Cala Aiguablava").
  // For 'person' it may be a contact id, resolved client-side against the
  // contacts store — an opaque string here keeps gallery free of module deps.
  name: string
  count?: number // items carrying this tag (filled by GET /tags)
}

export type YMediaAssetStatus = 'pending' | 'ok' | 'failed' | 'unsupported'

export interface YMediaItem extends YFileRef {
  id: string
  kind: YMediaKind
  takenAt?: string // EXIF DateTimeOriginal (naive local ISO), fallback file mtime
  width?: number
  height?: number
  gps?: YGeoPoint
  cameraMake?: string
  cameraModel?: string
  durationS?: number // video only
  thumbStatus: YMediaAssetStatus
  missing?: boolean // file vanished on rescan (tags survive the HDD being offline)
  tags: YMediaTag[]
}

export interface YMediaPage {
  items: YMediaItem[]
  nextCursor?: string
}

export interface YAlbum {
  id: string
  name: string
  coverItemId?: string
  createdAt: string
}

export interface YGalleryStatus {
  total: number
  pendingMeta: number
  pendingThumbs: number
  scanning: boolean
}

export interface YMediaFilter {
  cursor?: string
  limit?: number
  tag?: string // tag id
  kind?: YMediaKind
  from?: string // takenAt >= from (ISO)
  to?: string // takenAt <= to (ISO)
}
