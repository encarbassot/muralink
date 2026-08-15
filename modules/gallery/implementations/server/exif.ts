// EXIF extraction via exifr — pure JS, header-only reads, no exiftool binary.
// Failures are data, not exceptions: a corrupt file yields meta_status 'failed'
// and the scan batch moves on.

import exifr from 'exifr'

export interface ExtractedMeta {
  takenAt?: string // naive local ISO (EXIF has no timezone — do NOT convert to UTC)
  width?: number
  height?: number
  gpsLat?: number
  gpsLon?: number
  cameraMake?: string
  cameraModel?: string
}

// EXIF DateTimeOriginal is timezone-less; exifr parses it into a JS Date using
// the server's local zone. Re-format naively so what's stored is the wall-clock
// time the photo was taken, stable regardless of server timezone shifts.
function naiveIso(d: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export async function extractMeta(abs: string, mtimeMs: number): Promise<ExtractedMeta> {
  const meta: ExtractedMeta = {}
  try {
    const data = (await exifr.parse(abs, { gps: true, tiff: true, exif: true })) as
      | Record<string, unknown>
      | undefined
    if (data) {
      const taken = data['DateTimeOriginal'] ?? data['CreateDate']
      if (taken instanceof Date && !Number.isNaN(taken.getTime())) meta.takenAt = naiveIso(taken)
      if (typeof data['ExifImageWidth'] === 'number') meta.width = data['ExifImageWidth']
      if (typeof data['ExifImageHeight'] === 'number') meta.height = data['ExifImageHeight']
      if (typeof data['latitude'] === 'number' && typeof data['longitude'] === 'number') {
        meta.gpsLat = data['latitude']
        meta.gpsLon = data['longitude']
      }
      if (typeof data['Make'] === 'string') meta.cameraMake = data['Make'].trim()
      if (typeof data['Model'] === 'string') meta.cameraModel = data['Model'].trim()
    }
  } catch {
    // No parsable EXIF (videos, PNGs, corrupt files) — fall through to mtime.
  }
  if (!meta.takenAt) meta.takenAt = naiveIso(new Date(mtimeMs))
  return meta
}
