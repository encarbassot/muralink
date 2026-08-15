import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  getStockItems, getStockItem, createStockItem,
  updateStockItem, adjustQuantity, deleteStockItem, getLowStockItems,
  getLocations, createLocation, updateLocation, deleteLocation,
} from './queries.ts'
import type { YStockItem, YLocation } from '../../types.ts'

export function createStockRouter(db: Database): Router {
  const router = Router()

  router.get('/stock', (req, res) => {
    const category = req.query['category'] ? String(req.query['category']) : undefined
    res.json(getStockItems(db, category))
  })

  router.get('/stock/low', (_req, res) => {
    res.json(getLowStockItems(db))
  })

  // Locations — declared before '/stock/:id' so the :id param never swallows
  // the 'locations' path segment.
  router.get('/stock/locations', (_req, res) => {
    res.json(getLocations(db))
  })

  router.post('/stock/locations', (req, res) => {
    const body = req.body as Omit<YLocation, 'id' | 'createdAt'>
    if (!body.name) { res.status(400).json({ error: 'name required' }); return }
    const location = createLocation(db, {
      id: randomUUID(),
      ...body,
      createdAt: new Date().toISOString(),
    })
    res.status(201).json(location)
  })

  router.patch('/stock/locations/:id', (req, res) => {
    const updated = updateLocation(db, req.params['id']!, req.body as Partial<Omit<YLocation, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/stock/locations/:id', (req, res) => {
    if (!deleteLocation(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
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
