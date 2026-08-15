import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { YCalendarEvent } from '../../types.ts'
import { getEvents, getEvent, createEvent, updateEvent, deleteEvent } from './queries.ts'

// Optional post-write hooks. The base calendar module stays agnostic to any
// sync target; the orchester composes Google sync in by passing hooks that
// enqueue an outbox row. Only user-origin HTTP writes reach these — sync-origin
// writes call queries.* directly and never trigger a hook (no echo loop).
export interface CalendarWriteHooks {
  onCreate(event: YCalendarEvent): void
  onUpdate(event: YCalendarEvent): void
  onDelete(event: YCalendarEvent): void
}

export function createCalendarRouter(db: Database, hooks?: CalendarWriteHooks): Router {
  const router = Router()

  router.get('/events', (req, res) => {
    const from = String(req.query['from'] ?? new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    const to = String(req.query['to'] ?? new Date(Date.now() + 7 * 86400000).toISOString())
    res.json(getEvents(db, from, to))
  })

  router.get('/events/:id', (req, res) => {
    const event = getEvent(db, req.params['id']!)
    if (!event) { res.status(404).json({ error: 'not found' }); return }
    res.json(event)
  })

  router.post('/events', (req, res) => {
    const body = req.body as {
      title: string
      start: { iso: string; timezone: string }
      end: { iso: string; timezone: string }
      allDay?: boolean
      rrule?: string
      blocks?: import('@muralink/types').YBlock[]
      facets?: import('@muralink/types').YFacet[]
      metadata?: Record<string, string>
    }
    const event = createEvent(db, {
      id: randomUUID(),
      title: body.title,
      start: body.start,
      end: body.end,
      allDay: body.allDay ?? false,
      rrule: body.rrule,
      blocks: body.blocks,
      facets: body.facets,
      metadata: body.metadata,
    })
    hooks?.onCreate(event)
    res.status(201).json(event)
  })

  router.patch('/events/:id', (req, res) => {
    const updated = updateEvent(db, req.params['id']!, req.body as Parameters<typeof updateEvent>[2])
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    hooks?.onUpdate(updated)
    res.json(updated)
  })

  router.delete('/events/:id', (req, res) => {
    // Read before deleting so the hook can see the Google mapping to remove.
    const existing = getEvent(db, req.params['id']!)
    const deleted = deleteEvent(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    if (existing) hooks?.onDelete(existing)
    res.status(204).end()
  })

  return router
}
