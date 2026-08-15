// Minimal durable job runner. The queue is a SQLite table (survives restarts),
// the worker a single in-process async loop with concurrency 1 — sharp and
// hashing must never starve the request path on an old laptop. better-sqlite3
// is synchronous, so every DB touch here is a short claim/update; the slow
// parts (decode, hash) are awaited file IO between them.

import { randomUUID, createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { Database } from 'better-sqlite3'
import type { GalleryFileAccess } from './fileAccess.ts'
import { getItemRow } from './queries.ts'
import { extractMeta } from './exif.ts'
import { generateThumb, ensureThumbDir } from './thumbs.ts'

export type JobType = 'meta' | 'thumb' | 'hash'

interface JobRow {
  id: string
  type: JobType
  item_id: string | null
  status: string
  attempts: number
}

const MAX_ATTEMPTS = 3
// meta before thumb (taken_at drives the grid order), hash last (lazy dedup).
const TYPE_PRIORITY: JobType[] = ['meta', 'thumb', 'hash']

export function enqueue(db: Database, type: JobType, itemId: string): void {
  // One live job per (type, item): skip if an equivalent queued job exists.
  const existing = db
    .prepare<[string, string], { id: string }>(
      `SELECT id FROM media_jobs WHERE type = ? AND item_id = ? AND status = 'queued'`,
    )
    .get(type, itemId)
  if (existing) return
  db.prepare(
    `INSERT INTO media_jobs (id, type, item_id, status, updated_at) VALUES (?, ?, ?, 'queued', ?)`,
  ).run(randomUUID(), type, itemId, new Date().toISOString())
}

function sha256File(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(abs)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

async function runJob(db: Database, files: GalleryFileAccess, job: JobRow): Promise<void> {
  const item = job.item_id ? getItemRow(db, job.item_id) : undefined
  if (!item || item.missing === 1) return // item vanished — job is moot
  const abs = files.resolve(item.path)
  if (!abs) return

  if (job.type === 'meta') {
    const meta = await extractMeta(abs, item.mtime_ms)
    db.prepare(
      `UPDATE media_items SET taken_at = ?, width = COALESCE(?, width), height = COALESCE(?, height),
       gps_lat = ?, gps_lon = ?, camera_make = ?, camera_model = ?, meta_status = 'ok' WHERE id = ?`,
    ).run(
      meta.takenAt ?? null,
      meta.width ?? null,
      meta.height ?? null,
      meta.gpsLat ?? null,
      meta.gpsLon ?? null,
      meta.cameraMake ?? null,
      meta.cameraModel ?? null,
      item.id,
    )
  } else if (job.type === 'thumb') {
    if (item.kind !== 'image') {
      // Video posters need ffmpeg — phase 2. Mark unsupported so the UI shows a placeholder.
      db.prepare(`UPDATE media_items SET thumb_status = 'unsupported' WHERE id = ?`).run(item.id)
      return
    }
    const result = await generateThumb(abs, files.thumbDir, item.id)
    db.prepare(
      `UPDATE media_items SET thumb_status = ?, width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?`,
    ).run(result.status, result.width ?? null, result.height ?? null, item.id)
    if (result.status === 'failed') throw new Error(result.error ?? 'thumb failed')
  } else {
    const hash = await sha256File(abs)
    db.prepare(`UPDATE media_items SET content_hash = ? WHERE id = ?`).run(hash, item.id)
  }
}

export interface GalleryWorker {
  /** Nudge the loop — call after enqueueing a batch. */
  kick(): void
  stop(): void
}

export function startGalleryWorker(db: Database, files: GalleryFileAccess): GalleryWorker {
  let stopped = false
  let draining = false
  let timer: ReturnType<typeof setTimeout> | null = null

  // Recover jobs left 'running' by a previous crash.
  db.prepare(`UPDATE media_jobs SET status = 'queued' WHERE status = 'running'`).run()
  void ensureThumbDir(files.thumbDir)

  const claim = (): JobRow | undefined => {
    for (const type of TYPE_PRIORITY) {
      const job = db
        .prepare<[string], JobRow>(
          `SELECT * FROM media_jobs WHERE status = 'queued' AND type = ? ORDER BY updated_at LIMIT 1`,
        )
        .get(type)
      if (job) {
        db.prepare(`UPDATE media_jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), job.id)
        return { ...job, attempts: job.attempts + 1 }
      }
    }
    return undefined
  }

  const drain = async (): Promise<void> => {
    if (stopped || draining) return
    draining = true
    try {
      for (;;) {
        if (stopped) return
        const job = claim()
        if (!job) break
        try {
          await runJob(db, files, job)
          db.prepare(`UPDATE media_jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), job.id)
        } catch (e) {
          const status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued'
          db.prepare(`UPDATE media_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?`)
            .run(status, String(e), new Date().toISOString(), job.id)
        }
      }
    } finally {
      draining = false
      // Idle poll: cheap (one indexed SELECT) and picks up jobs enqueued by
      // request handlers without any signaling plumbing.
      if (!stopped) timer = setTimeout(() => void drain(), 2000)
    }
  }

  void drain()
  return {
    kick: () => { if (timer) { clearTimeout(timer); timer = null }; void drain() },
    stop: () => { stopped = true; if (timer) clearTimeout(timer) },
  }
}
