import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getEntries, getEntry, createEntry, updateEntry, deleteEntry } from './queries.ts'
import type { YExpenseEntry } from '../../types.ts'

// REST shape matches @muralink/spaces makeHttpSpace so a host can register an
// orchester space at '/api/expenses/entries' and the same store syncs to it.
export function createExpensesRouter(db: Database): Router {
  const router = Router()

  router.get('/entries', (req, res) => {
    const accountId = req.query['accountId'] ? String(req.query['accountId']) : undefined
    res.json(getEntries(db, accountId))
  })

  router.get('/entries/:id', (req, res) => {
    const entry = getEntry(db, req.params['id']!)
    if (!entry) { res.status(404).json({ error: 'not found' }); return }
    res.json(entry)
  })

  router.post('/entries', (req, res) => {
    const body = req.body as Partial<YExpenseEntry>
    if (!body.accountId || !body.amount) { res.status(400).json({ error: 'accountId and amount required' }); return }
    const now = new Date().toISOString()
    const entry = createEntry(db, {
      id: body.id ?? randomUUID(),
      accountId: body.accountId,
      amount: body.amount,
      providedBy: body.providedBy ?? 'me',
      description: body.description ?? '',
      dateText: body.dateText,
      hours: body.hours,
      km: body.km,
      notes: body.notes,
      url: body.url,
      createdAt: body.createdAt ?? { iso: now, timezone: 'UTC' },
      updatedAt: body.updatedAt,
    })
    res.status(201).json(entry)
  })

  router.patch('/entries/:id', (req, res) => {
    const updated = updateEntry(db, req.params['id']!, req.body as Partial<Omit<YExpenseEntry, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/entries/:id', (req, res) => {
    const deleted = deleteEntry(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
