// Habits REST routes, mounted at /api/habits. Definitions live at the mount
// root ('/api/habits'), checks at '/api/habits/checks' — the sub-router is
// mounted BEFORE the '/:id' definition routes so 'checks' never matches as an
// id (Express order matters).

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { YHabitDef, YHabitCheck } from '../../types.ts'
import {
  getHabits, getHabit, createHabit, updateHabit, deleteHabit,
  getChecks, getCheck, createCheck, deleteCheck,
} from './queries.ts'

export function createHabitsRouter(db: Database): Router {
  const router = Router()

  const checks = Router()

  checks.get('/', (req, res) => {
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined
    res.json(getChecks(db, from, to))
  })

  checks.get('/:id', (req, res) => {
    const check = getCheck(db, req.params['id']!)
    if (!check) { res.status(404).json({ error: 'not found' }); return }
    res.json(check)
  })

  checks.post('/', (req, res) => {
    const body = req.body as Partial<YHabitCheck>
    if (!body.habitId || !body.date) {
      res.status(400).json({ error: 'habitId and date required' })
      return
    }
    const check = createCheck(db, {
      id: body.id ?? randomUUID(),
      habitId: body.habitId,
      date: body.date,
      checkedAt: body.checkedAt ?? new Date().toISOString(),
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(check)
  })

  checks.delete('/:id', (req, res) => {
    const deleted = deleteCheck(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // Mounted before the '/:id' routes below.
  router.use('/checks', checks)

  router.get('/', (_req, res) => {
    res.json(getHabits(db))
  })

  router.get('/:id', (req, res) => {
    const habit = getHabit(db, req.params['id']!)
    if (!habit) { res.status(404).json({ error: 'not found' }); return }
    res.json(habit)
  })

  router.post('/', (req, res) => {
    const body = req.body as Partial<YHabitDef>
    const habit = createHabit(db, {
      id: body.id ?? randomUUID(),
      title: body.title ?? '',
      icon: body.icon ?? '✅',
      polarity: body.polarity === 'bad' ? 'bad' : 'good',
      rrule: body.rrule,
      reminderId: body.reminderId,
      timerId: body.timerId,
      sort: body.sort,
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(habit)
  })

  router.patch('/:id', (req, res) => {
    const updated = updateHabit(db, req.params['id']!, req.body as Partial<Omit<YHabitDef, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    const deleted = deleteHabit(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
