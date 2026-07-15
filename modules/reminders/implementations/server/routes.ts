// Reminders REST routes, mounted at /api/reminders. Routes are at the mount
// root so the client-side http space uses path '/api/reminders' directly.
// Attribution: createdBy comes from the X-Mural-User header (trusted —
// single-token MVP).

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getReminders, getReminder, createReminder, updateReminder, deleteReminder } from './queries.ts'
import type { YReminder } from '../../types.ts'

export function createRemindersRouter(db: Database): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(getReminders(db))
  })

  router.get('/:id', (req, res) => {
    const reminder = getReminder(db, req.params['id']!)
    if (!reminder) { res.status(404).json({ error: 'not found' }); return }
    res.json(reminder)
  })

  router.post('/', (req, res) => {
    const body = req.body as Partial<YReminder>
    const reminder = createReminder(db, {
      id: randomUUID(),
      title: body.title ?? '',
      done: body.done ?? false,
      dueAt: body.dueAt,
      assignee: body.assignee,
      createdBy: (req.header('x-mural-user') ?? body.createdBy) || undefined,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(reminder)
  })

  router.patch('/:id', (req, res) => {
    const updated = updateReminder(db, req.params['id']!, req.body as Partial<Omit<YReminder, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    const deleted = deleteReminder(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
