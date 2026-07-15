import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getContacts, getContact, createContact, updateContact, deleteContact } from './queries.ts'
import type { YContact } from '../../types.ts'

export function createContactsRouter(db: Database): Router {
  const router = Router()

  router.get('/contacts', (req, res) => {
    const search = req.query['search'] ? String(req.query['search']) : undefined
    res.json(getContacts(db, search))
  })

  router.get('/contacts/:id', (req, res) => {
    const contact = getContact(db, req.params['id']!)
    if (!contact) { res.status(404).json({ error: 'not found' }); return }
    res.json(contact)
  })

  router.post('/contacts', (req, res) => {
    const body = req.body as Omit<YContact, 'id' | 'createdAt'>
    const now = new Date().toISOString()
    const contact = createContact(db, {
      id: randomUUID(),
      name: body.name,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
      createdAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(contact)
  })

  router.patch('/contacts/:id', (req, res) => {
    const updated = updateContact(db, req.params['id']!, req.body as Partial<Omit<YContact, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/contacts/:id', (req, res) => {
    const deleted = deleteContact(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
