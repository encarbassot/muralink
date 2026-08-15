// Murales REST routes, mounted at /api/murales. Routes are at the mount root
// so the client-side http space uses path '/api/murales' directly.
//
// Access model: mutations are master-only. A relayed guest (scoped token with
// a muralId grant) can read exactly its shared mural via GET /shared — its
// files ride the storage routes because the share's root path is the mural's
// folder.

import { Router, type Request } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getMurales, getMural, createMural, updateMural, deleteMural } from './queries.ts'
import { defaultGrid, type YMural } from '../../types.ts'

// Minimal structural view of the core's per-request access (platforms/server
// middleware/auth.ts). The module can't import the platform (one-way deps).
interface AccessLike {
  kind: 'master' | 'scoped'
  muralId?: string
}

function accessOf(req: Request): AccessLike | undefined {
  return (req as Request & { access?: AccessLike }).access
}

export function createMuralesRouter(db: Database): Router {
  const router = Router()

  // Scoped-guest read: the one mural this share grants, read-only.
  router.get('/shared', (req, res) => {
    const access = accessOf(req)
    if (access?.kind !== 'scoped' || !access.muralId) {
      res.status(403).json({ error: 'no mural grant' })
      return
    }
    const mural = getMural(db, access.muralId)
    if (!mural) { res.status(404).json({ error: 'not found' }); return }
    res.json(mural)
  })

  // Everything below is master-only.
  router.use((req, res, next) => {
    if (accessOf(req)?.kind !== 'master') {
      res.status(403).json({ error: 'master only' })
      return
    }
    next()
  })

  router.get('/', (_req, res) => {
    res.json(getMurales(db))
  })

  router.get('/:id', (req, res) => {
    const mural = getMural(db, req.params['id']!)
    if (!mural) { res.status(404).json({ error: 'not found' }); return }
    res.json(mural)
  })

  router.post('/', (req, res) => {
    const body = req.body as Partial<YMural>
    // Preserve the client id when given — mural ids anchor mural:// references
    // and share grants, so they must survive the move between spaces.
    const mural = createMural(db, {
      id: body.id ?? randomUUID(),
      title: body.title ?? 'Nuevo mural',
      emoji: body.emoji,
      elements: body.elements ?? [],
      arrows: body.arrows,
      grid: body.grid ?? defaultGrid(),
      public: body.public,
      createdBy: (req.header('x-mural-user') ?? body.createdBy) || undefined,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(mural)
  })

  router.patch('/:id', (req, res) => {
    const updated = updateMural(db, req.params['id']!, req.body as Partial<Omit<YMural, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    const deleted = deleteMural(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
