import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  getStockItems, getStockItem, createStockItem,
  updateStockItem, adjustQuantity, deleteStockItem, getLowStockItems,
} from './queries.ts'
import type { YStockItem } from '../../types.ts'

export function createStockRouter(db: Database): Router {
  const router = Router()

  router.get('/stock', (req, res) => {
    const category = req.query['category'] ? String(req.query['category']) : undefined
    res.json(getStockItems(db, category))
  })

  router.get('/stock/low', (_req, res) => {
    res.json(getLowStockItems(db))
  })

  router.get('/stock/:id', (req, res) => {
    const item = getStockItem(db, req.params['id']!)
    if (!item) { res.status(404).json({ error: 'not found' }); return }
    res.json(item)
  })

  router.post('/stock', (req, res) => {
    const body = req.body as Omit<YStockItem, 'id' | 'updatedAt'>
    const item = createStockItem(db, {
      id: randomUUID(),
      ...body,
      updatedAt: new Date().toISOString(),
    })
    res.status(201).json(item)
  })

  router.patch('/stock/:id', (req, res) => {
    const updated = updateStockItem(db, req.params['id']!, req.body as Partial<Omit<YStockItem, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.post('/stock/:id/adjust', (req, res) => {
    const { delta } = req.body as { delta?: number }
    if (typeof delta !== 'number') { res.status(400).json({ error: 'delta (number) required' }); return }
    const updated = adjustQuantity(db, req.params['id']!, delta)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/stock/:id', (req, res) => {
    if (!deleteStockItem(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
