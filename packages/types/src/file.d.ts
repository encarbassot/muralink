/** What broad kind of media a file is, as far as the platform cares. */
export type YMediaKind = 'image' | 'video';
/** A geographic point (EXIF GPS, map markers). WGS84 decimal degrees. */
export interface YGeoPoint {
    lat: number;
    lon: number;
}
/** A reference to a file hosted by a storage layer (NAS root, drive…).
 *  `path` is always relative to the storage root — roots can move disks. */
export interface YFileRef {
    path: string;
    size: number;
    mtimeMs: number;
    mime?: string;
}
