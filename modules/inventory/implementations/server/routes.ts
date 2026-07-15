import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  getItems, getItem, getLowStockItems, createItem, updateItem, deleteItem,
  getMovementHistory, recordMovement,
} from './queries.ts'
import type { YItem, YStockMovement } from '../../types.ts'

export function createInventoryRouter(db: Database): Router {
  const router = Router()

  // Items
  router.get('/items', (_req, res) => { res.json(getItems(db)) })

  router.get('/items/low-stock', (_req, res) => { res.json(getLowStockItems(db)) })

  router.get('/items/:id', (req, res) => {
    const item = getItem(db, req.params['id']!)
    if (!item) { res.status(404).json({ error: 'not found' }); return }
    res.json(item)
  })

  router.post('/items', (req, res) => {
    const body = req.body as Omit<YItem, 'id' | 'createdAt'>
    const now = new Date().toISOString()
    const item = createItem(db, {
      id: randomUUID(),
      ...body,
      quantity: body.quantity ?? 0,
      createdAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(item)
  })

  router.patch('/items/:id', (req, res) => {
    const updated = updateItem(db, req.params['id']!, req.body as Partial<Omit<YItem, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/items/:id', (req, res) => {
    if (!deleteItem(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // Stock movements
  router.get('/items/:id/movements', (req, res) => {
    const item = getItem(db, req.params['id']!)
    if (!item) { res.status(404).json({ error: 'not found' }); return }
    res.json(getMovementHistory(db, req.params['id']!))
  })

  router.post('/items/:id/movements', (req, res) => {
    const item = getItem(db, req.params['id']!)
    if (!item) { res.status(404).json({ error: 'not found' }); return }
    const body = req.body as Pick<YStockMovement, 'type' | 'quantity' | 'reason'>
    const now = new Date().toISOString()
    // out and adjustment with negative delta use negative quantity
    const delta =
      body.type === 'out' ? -Math.abs(body.quantity) : body.quantity
    const movement = recordMovement(db, {
      id: randomUUID(),
      itemId: req.params['id']!,
      type: body.type,
      quantity: delta,
      reason: body.reason,
      performedAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(movement)
  })

  return router
}
