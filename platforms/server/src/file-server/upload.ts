// Chunked, resumable upload for the NAS storage router. Built for "3 years of
// phone photos over a browser": parts are streamed straight to disk (never
// buffered in memory), survive reloads/network drops via offset resume, and
// support advisory dedup by content hash.
//
// Parts live under <root>/.uploads/ — a dotdir, so listDir and the gallery
// scanner both ignore it. Each part has a JSON sidecar describing the target.
//
//   POST   /upload/init                  { dir, name, size, mtimeMs?, sha256? } → { uploadId, offset }
//   POST   /upload/:uploadId/chunk?offset=N   (raw stream)                     → { received }
//   POST   /upload/:uploadId/complete    { sha256? }                           → { ok, path, duplicate? }
//   DELETE /upload/:uploadId
//
// The chunk route deliberately has NO body parser: the global express.json()
// only parses application/json, so an application/octet-stream request arrives
// here as a readable stream and is piped to the part file at the given offset.

import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join, basename, dirname, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction, Router } from 'express'
import { safePathWithin } from '../file-routes/index.ts'
import { wouldExceed, type NasQuota } from './quota.ts'

const UPLOADS_DIR = '.uploads'
const PART_TTL_MS = 7 * 24 * 60 * 60 * 1000 // GC parts older than 7 days
const ID_PATTERN = /^[0-9a-f-]{36}$/ // uuid only — an uploadId is a path segment

interface UploadSidecar {
  dir: string // relative to the effective root at init time
  name: string
  size: number
  mtimeMs?: number
  sha256?: string
  createdAt: string
}

export interface UploadHooks {
  /** Called with the ownerRoot-relative path of every file that lands on disk. */
  onFileWritten?: (relPath: string) => void
  /** Advisory dedup: return the existing ownerRoot-relative path for a hash, or null. */
  findDuplicate?: (sha256: string) => string | null
}

const uploadsDir = (root: string): string => join(root, UPLOADS_DIR)
const partPath = (root: string, id: string): string => join(uploadsDir(root), `${id}.part`)
const sidecarPath = (root: string, id: string): string => join(uploadsDir(root), `${id}.json`)

async function readSidecar(root: string, id: string): Promise<UploadSidecar | null> {
  try {
    return JSON.parse(await readFile(sidecarPath(root, id), 'utf8')) as UploadSidecar
  } catch {
    return null
  }
}

async function partSize(root: string, id: string): Promise<number> {
  try {
    return (await stat(partPath(root, id))).size
  } catch {
    return 0
  }
}

async function removeUpload(root: string, id: string): Promise<void> {
  await rm(partPath(root, id), { force: true })
  await rm(sidecarPath(root, id), { force: true })
}

/** Delete stale parts (crashed/abandoned uploads). Called once at router creation. */
export async function gcUploads(root: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(uploadsDir(root))
  } catch {
    return // no .uploads yet
  }
  const now = Date.now()
  for (const name of entries) {
    try {
      const abs = join(uploadsDir(root), name)
      if (now - (await stat(abs)).mtimeMs > PART_TTL_MS) await rm(abs, { force: true })
    } catch { /* raced */ }
  }
}

export function registerUploadRoutes(
  router: Router,
  ownerRoot: string,
  gate: (op: 'read' | 'write' | 'delete') => (req: Request, res: Response, next: NextFunction) => void,
  effRoot: (req: Request) => string,
  hooks: UploadHooks,
  quota?: NasQuota,
): void {
  const overQuota = async (res: Response): Promise<void> => {
    res.status(413).json({
      error: 'quota exceeded',
      usedBytes: await (quota?.usedBytes() ?? Promise.resolve(0)),
      maxBytes: quota?.maxBytes ?? null,
    })
  }
  router.post('/upload/init', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const body = req.body as { dir?: string; name?: string; size?: number; mtimeMs?: number; sha256?: string }
    const name = basename(String(body.name ?? ''))
    const size = Number(body.size)
    if (!name || !Number.isFinite(size) || size < 0) {
      res.status(400).json({ error: 'missing name/size' }); return
    }
    const dirAbs = safePathWithin(root, String(body.dir ?? root))
    if (!dirAbs) { res.status(403).json({ error: 'forbidden' }); return }
    const dirRel = relative(root, dirAbs)

    // The declared size is known up-front — reject over-quota uploads before
    // any part is created. (Resumed uploads re-check with their part already
    // on disk counted in usage; the delta guard in chunk covers races.)
    if (quota && await wouldExceed(quota, size)) { await overQuota(res); return }

    try {
      await mkdir(uploadsDir(root), { recursive: true })

      // Resume: an existing part for the same (dir, name, size) continues where it left off.
      for (const entry of await readdir(uploadsDir(root))) {
        if (!entry.endsWith('.json')) continue
        const id = entry.slice(0, -'.json'.length)
        if (!ID_PATTERN.test(id)) continue
        const sc = await readSidecar(root, id)
        if (sc && sc.dir === dirRel && sc.name === name && sc.size === size) {
          res.json({ uploadId: id, offset: await partSize(root, id) }); return
        }
      }

      const uploadId = randomUUID()
      const sidecar: UploadSidecar = {
        dir: dirRel,
        name,
        size,
        mtimeMs: typeof body.mtimeMs === 'number' ? body.mtimeMs : undefined,
        sha256: typeof body.sha256 === 'string' ? body.sha256 : undefined,
        createdAt: new Date().toISOString(),
      }
      await writeFile(sidecarPath(root, uploadId), JSON.stringify(sidecar))
      await writeFile(partPath(root, uploadId), Buffer.alloc(0))
      res.json({ uploadId, offset: 0 })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // NO body parser here — the raw request stream is the chunk.
  router.post('/upload/:uploadId/chunk', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const id = String(req.params['uploadId'])
    if (!ID_PATTERN.test(id)) { res.status(400).json({ error: 'bad uploadId' }); return }
    const sidecar = await readSidecar(root, id)
    if (!sidecar) { res.status(404).json({ error: 'unknown upload' }); return }

    // Cheap concurrent-upload guard: usage (cached) already over the cap →
    // stop accepting bytes instead of streaming past the limit.
    if (quota && await wouldExceed(quota, 0)) { await overQuota(res); return }

    const offset = Number(req.query['offset'])
    const current = await partSize(root, id)
    if (!Number.isFinite(offset) || offset !== current) {
      // Client and server disagree (e.g. a retried chunk that already landed) —
      // report the real offset so the client resyncs instead of corrupting the part.
      res.status(409).json({ error: 'offset mismatch', offset: current }); return
    }

    const out = createWriteStream(partPath(root, id), { flags: 'r+', start: offset })
    req.pipe(out)
    out.on('finish', () => { void partSize(root, id).then(n => res.json({ received: n })) })
    out.on('error', e => { res.status(500).json({ error: String(e) }) })
    req.on('error', () => out.destroy()) // client dropped mid-chunk — keep bytes written so far
  })

  router.post('/upload/:uploadId/complete', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const id = String(req.params['uploadId'])
    if (!ID_PATTERN.test(id)) { res.status(400).json({ error: 'bad uploadId' }); return }
    const sidecar = await readSidecar(root, id)
    if (!sidecar) { res.status(404).json({ error: 'unknown upload' }); return }

    const size = await partSize(root, id)
    if (size !== sidecar.size) {
      res.status(409).json({ error: 'incomplete', offset: size, expected: sidecar.size }); return
    }

    const body = req.body as { sha256?: string }
    const sha256 = typeof body?.sha256 === 'string' ? body.sha256 : sidecar.sha256

    try {
      // Advisory dedup: same bytes already indexed → drop the part, point at the original.
      if (sha256 && hooks.findDuplicate) {
        const existing = hooks.findDuplicate(sha256)
        if (existing) {
          await removeUpload(root, id)
          res.json({ ok: true, duplicate: { existingPath: existing } }); return
        }
      }

      const dest = safePathWithin(root, join(root, sidecar.dir, sidecar.name))
      if (!dest) { res.status(403).json({ error: 'forbidden' }); return }
      await mkdir(dirname(dest), { recursive: true })
      await rename(partPath(root, id), dest)
      // Preserve the phone's original mtime — it's the taken-at fallback.
      if (sidecar.mtimeMs) await utimes(dest, new Date(), new Date(sidecar.mtimeMs)).catch(() => {})
      await rm(sidecarPath(root, id), { force: true })

      quota?.invalidate()
      const rel = relative(ownerRoot, dest).split(sep).join('/')
      hooks.onFileWritten?.(rel)
      res.json({ ok: true, path: dest })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  router.delete('/upload/:uploadId', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const id = String(req.params['uploadId'])
    if (!ID_PATTERN.test(id)) { res.status(400).json({ error: 'bad uploadId' }); return }
    await removeUpload(root, id)
    quota?.invalidate()
    res.status(204).end()
  })
}
