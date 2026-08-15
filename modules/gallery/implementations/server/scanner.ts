// Root scanner: walks the NAS root and reconciles the media index with what's
// actually on disk. Mandatory because rescued-HDD files arrive via cp/USB,
// outside any upload API. Runs at boot, after uploads, and on demand.

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import type { GalleryFileAccess } from './fileAccess.ts'
import { upsertItem, markMissingExcept, type UpsertFile } from './queries.ts'
import { enqueue, type GalleryWorker } from './jobs.ts'

// Skip files modified in the last 5s — likely still being copied.
const SETTLE_MS = 5_000

function mediaKind(mime: string): 'image' | 'video' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return null
}

let scanning = false
export function isScanning(): boolean {
  return scanning
}

/** Index a single freshly-written file (the upload-complete hook). */
export function indexFile(db: Database, files: GalleryFileAccess, rel: string, worker?: GalleryWorker): void {
  const abs = files.resolve(rel)
  if (!abs) return
  void stat(abs).then(s => {
    const mime = files.mimeFor(rel)
    const kind = mediaKind(mime)
    if (!kind || !s.isFile()) return
    const id = upsertItem(db, { path: rel, kind, mime, size: s.size, mtimeMs: s.mtimeMs })
    if (id) {
      enqueue(db, 'meta', id)
      enqueue(db, 'thumb', id)
      enqueue(db, 'hash', id)
      worker?.kick()
    }
  }).catch(() => { /* file vanished between write and index — next scan reconciles */ })
}

export async function scanRoot(db: Database, files: GalleryFileAccess, worker?: GalleryWorker): Promise<void> {
  if (scanning) return
  scanning = true
  try {
    const seen = new Set<string>()
    const now = Date.now()

    const walk = async (relDir: string): Promise<void> => {
      const abs = files.resolve(relDir)
      if (!abs) return
      let entries
      try {
        entries = await readdir(abs, { withFileTypes: true })
      } catch {
        return // unreadable dir — skip, don't abort the scan
      }
      const batch: UpsertFile[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue // dotfiles incl. .uploads
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(rel)
          continue
        }
        if (!entry.isFile()) continue
        const mime = files.mimeFor(entry.name)
        const kind = mediaKind(mime)
        if (!kind) continue
        try {
          const s = await stat(join(abs, entry.name))
          if (now - s.mtimeMs < SETTLE_MS) continue // half-written copy
          seen.add(rel)
          batch.push({ path: rel, kind, mime, size: s.size, mtimeMs: s.mtimeMs })
        } catch { /* raced deletion */ }
      }
      // One transaction per directory batch — thousands of single inserts
      // would otherwise dominate scan time on big libraries.
      const ids: string[] = []
      const tx = db.transaction((filesBatch: UpsertFile[]) => {
        for (const f of filesBatch) {
          const id = upsertItem(db, f)
          if (id) ids.push(id)
        }
      })
      tx(batch)
      for (const id of ids) {
        enqueue(db, 'meta', id)
        enqueue(db, 'thumb', id)
        enqueue(db, 'hash', id)
      }
      if (ids.length > 0) worker?.kick()
    }

    await walk('')
    markMissingExcept(db, seen)
  } finally {
    scanning = false
  }
}
