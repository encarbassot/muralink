// File & media primitives — the contract for modules that reference NAS files
// (gallery, notes attachments, designer…) without depending on each other or on
// the storage layer. Zero dependencies, like every primitive here.

/** What broad kind of media a file is, as far as the platform cares. */
export type YMediaKind = 'image' | 'video'

/** A geographic point (EXIF GPS, map markers). WGS84 decimal degrees. */
export interface YGeoPoint {
  lat: number
  lon: number
}

/** A reference to a file hosted by a storage layer (NAS root, drive…).
 *  `path` is always relative to the storage root — roots can move disks. */
export interface YFileRef {
  path: string // POSIX-style, relative to the storage root
  size: number // bytes
  mtimeMs: number
  mime?: string
}
