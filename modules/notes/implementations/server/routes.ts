// Notes REST routes, mounted at /api/notes. Routes are at the mount root so
// the client-side http space uses path '/api/notes' directly. Attribution:
// createdBy comes from the X-Mural-User header (trusted — single-token MVP).

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getNotes, getNote, createNote, updateNote, deleteNote } from './queries.ts'
import type { YNote } from '../../types.ts'

export function createNotesRouter(db: Database): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const search = req.query['text'] ? String(req.query['text']) : undefined
    res.json(getNotes(db, search))
  })

  router.get('/:id', (req, res) => {
    const note = getNote(db, req.params['id']!)
    if (!note) { res.status(404).json({ error: 'not found' }); return }
    res.json(note)
  })

  router.post('/', (req, res) => {
    const body = req.body as Partial<YNote>
    const note = createNote(db, {
      id: randomUUID(),
      title: body.title ?? 'Untitled',
      body: body.body ?? '',
      color: body.color,
      createdBy: (req.header('x-mural-user') ?? body.createdBy) || undefined,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(note)
  })

  router.patch('/:id', (req, res) => {
    const updated = updateNote(db, req.params['id']!, req.body as Partial<Omit<YNote, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    const deleted = deleteNote(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
