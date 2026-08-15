// Gallery REST routes, mounted at /api/gallery. The platform injects the file
// capability (GalleryFileAccess) and owns when this router exists at all —
// no NAS configured means no gallery, same as /api/storage.

import { Router } from 'express'
import { existsSync } from 'node:fs'
import type { Database } from 'better-sqlite3'
import type { YMediaTagKind, YMediaFilter } from '../../types.ts'
import type { GalleryFileAccess } from './fileAccess.ts'
import { listItems, getItem, getItemRow, listTags, tagItem, untagItem, status } from './queries.ts'
import { thumbPath } from './thumbs.ts'
import { scanRoot, isScanning } from './scanner.ts'
import type { GalleryWorker } from './jobs.ts'

const TAG_KINDS: YMediaTagKind[] = ['user', 'person', 'location']

// Neutral placeholder when a thumb is pending/unsupported (videos in phase 1).
const placeholderSvg = (kind: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
  `<rect width="100" height="100" fill="#e5e5e5"/>` +
  `<text x="50" y="56" font-size="34" text-anchor="middle">${kind === 'video' ? '🎞️' : '🖼️'}</text></svg>`

export function createGalleryRouter(
  db: Database,
  files: GalleryFileAccess,
  worker?: GalleryWorker,
): Router {
  const router = Router()

  router.get('/items', (req, res) => {
    const q = req.query
    const filter: YMediaFilter = {
      cursor: typeof q['cursor'] === 'string' ? q['cursor'] : undefined,
      limit: q['limit'] ? Number(q['limit']) : undefined,
      tag: typeof q['tag'] === 'string' ? q['tag'] : undefined,
      kind: q['kind'] === 'image' || q['kind'] === 'video' ? q['kind'] : undefined,
      from: typeof q['from'] === 'string' ? q['from'] : undefined,
      to: typeof q['to'] === 'string' ? q['to'] : undefined,
    }
    res.json(listItems(db, filter))
  })

  router.get('/items/:id', (req, res) => {
    const item = getItem(db, req.params['id']!)
    if (!item) { res.status(404).json({ error: 'not found' }); return }
    res.json(item)
  })

  // Thumb URLs are id-based and content-stable → aggressively cacheable.
  router.get('/items/:id/thumb', (req, res) => {
    const row = getItemRow(db, req.params['id']!)
    if (!row) { res.status(404).json({ error: 'not found' }); return }
    const thumb = thumbPath(files.thumbDir, row.id)
    if (row.thumb_status === 'ok' && existsSync(thumb)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.sendFile(thumb)
      return
    }
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'no-store') // may become a real thumb shortly
    res.send(placeholderSvg(row.kind))
  })

  router.get('/items/:id/file', (req, res) => {
    const row = getItemRow(db, req.params['id']!)
    if (!row) { res.status(404).json({ error: 'not found' }); return }
    const abs = files.resolve(row.path)
    if (!abs) { res.status(403).json({ error: 'forbidden' }); return }
    files.serve(abs, req, res)
  })

  router.post('/items/:id/tags', (req, res) => {
    const itemId = req.params['id']!
    if (!getItemRow(db, itemId)) { res.status(404).json({ error: 'not found' }); return }
    const body = req.body as { name?: string; kind?: string }
    const name = (body.name ?? '').trim()
    if (!name) { res.status(400).json({ error: 'missing name' }); return }
    const kind = TAG_KINDS.includes(body.kind as YMediaTagKind) ? (body.kind as YMediaTagKind) : 'user'
    res.status(201).json(tagItem(db, itemId, name, kind))
  })

  router.delete('/items/:id/tags/:tagId', (req, res) => {
    const removed = untagItem(db, req.params['id']!, req.params['tagId']!)
    if (!removed) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  router.get('/tags', (req, res) => {
    const kind = req.query['kind']
    res.json(listTags(db, TAG_KINDS.includes(kind as YMediaTagKind) ? (kind as YMediaTagKind) : undefined))
  })

  router.post('/scan', (_req, res) => {
    const already = isScanning()
    if (!already) void scanRoot(db, files, worker)
    res.json({ started: !already, scanning: true })
  })

  router.get('/status', (_req, res) => {
    res.json(status(db, isScanning()))
  })

  return router
}
