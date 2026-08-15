// Thumbnail generation via sharp. Thumbs are a regenerable disk cache living
// OUTSIDE the NAS root (backups of the user's files stay clean): one webp per
// item id, 512px longest edge. Decode failures (HEIC/RAW on prebuilt sharp)
// are 'unsupported', never a throw — one bad file must not sink a scan batch.

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { YMediaAssetStatus } from '../../types.ts'

export const THUMB_SIZE = 512

export function thumbPath(thumbDir: string, itemId: string): string {
  return join(thumbDir, `${itemId}.webp`)
}

export async function ensureThumbDir(thumbDir: string): Promise<void> {
  await mkdir(thumbDir, { recursive: true })
}

export interface ThumbResult {
  status: YMediaAssetStatus
  width?: number // source dimensions, post EXIF-rotation — free metadata for the index
  height?: number
  error?: string
}

export async function generateThumb(
  abs: string,
  thumbDir: string,
  itemId: string,
): Promise<ThumbResult> {
  try {
    const image = sharp(abs, { failOn: 'truncated' }).rotate() // .rotate() applies EXIF orientation
    const meta = await image.metadata()
    await image
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(thumbPath(thumbDir, itemId))
    // Post-rotation dimensions: orientation 5-8 swaps width/height.
    const swap = (meta.orientation ?? 1) >= 5
    return {
      status: 'ok',
      width: swap ? meta.height : meta.width,
      height: swap ? meta.width : meta.height,
    }
  } catch (e) {
    const msg = String(e)
    // sharp without HEIF/RAW codecs reports an unsupported format — distinguish
    // "can't ever decode this" from a transient failure.
    const unsupported = /unsupported|not a valid|no decoding plugin|heif/i.test(msg)
    return { status: unsupported ? 'unsupported' : 'failed', error: msg }
  }
}
