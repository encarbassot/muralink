// Tracker REST routes, mounted at /api/tracker. Two flat sub-resources so the
// client-side http spaces use paths '/api/tracker/timers' and
// '/api/tracker/entries' directly.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { YTimerDef, YTimeEntry } from '../../types.ts'
import {
  getTimers, getTimer, createTimer, updateTimer, deleteTimer,
  getEntries, getEntry, createEntry, updateEntry, deleteEntry,
} from './queries.ts'

export function createTrackerRouter(db: Database): Router {
  const router = Router()

  const timers = Router()

  timers.get('/', (_req, res) => {
    res.json(getTimers(db))
  })

  timers.get('/:id', (req, res) => {
    const timer = getTimer(db, req.params['id']!)
    if (!timer) { res.status(404).json({ error: 'not found' }); return }
    res.json(timer)
  })

  timers.post('/', (req, res) => {
    const body = req.body as Partial<YTimerDef>
    const timer = createTimer(db, {
      id: body.id ?? randomUUID(),
      title: body.title ?? '',
      emoji: body.emoji,
      color: body.color,
      muralId: body.muralId,
      archived: body.archived,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(timer)
  })

  timers.patch('/:id', (req, res) => {
    const updated = updateTimer(db, req.params['id']!, req.body as Partial<Omit<YTimerDef, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  timers.delete('/:id', (req, res) => {
    const deleted = deleteTimer(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  const entries = Router()

  entries.get('/', (req, res) => {
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined
    res.json(getEntries(db, from, to))
  })

  entries.get('/:id', (req, res) => {
    const entry = getEntry(db, req.params['id']!)
    if (!entry) { res.status(404).json({ error: 'not found' }); return }
    res.json(entry)
  })

  entries.post('/', (req, res) => {
    const body = req.body as Partial<YTimeEntry>
    if (!body.timerId || !body.start?.iso) {
      res.status(400).json({ error: 'timerId and start required' })
      return
    }
    const entry = createEntry(db, {
      id: body.id ?? randomUUID(),
      timerId: body.timerId,
      start: body.start,
      end: body.end,
      note: body.note,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(entry)
  })

  entries.patch('/:id', (req, res) => {
    const updated = updateEntry(db, req.params['id']!, req.body as Partial<Omit<YTimeEntry, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  entries.delete('/:id', (req, res) => {
    const deleted = deleteEntry(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  router.use('/timers', timers)
  router.use('/entries', entries)

  return router
}
