import { Router, type Request } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { canView, type TrustGroup } from '@muralink/types'
import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getPreparedMessages,
  getPreparedMessage,
  upsertPreparedMessage,
  deletePreparedMessage,
  getTrustGroups,
  createTrustGroup,
  updateTrustGroup,
  deleteTrustGroup,
  getContactLocations,
  createContactLocation,
  updateContactLocation,
  deleteContactLocation,
} from './queries.ts'
import type { YContact, YContactLocation, YPreparedMessage } from '../../types.ts'
import { preparedMessageId } from '../../types.ts'

// Minimal structural view of the core's per-request access (platforms/server
// middleware/auth.ts). The module can't import the platform (one-way deps).
interface AccessLike {
  kind: 'master' | 'scoped'
  contactLocations?: boolean
  viewerEmail?: string
}

function accessOf(req: Request): AccessLike | undefined {
  return (req as Request & { access?: AccessLike }).access
}

export function createContactsRouter(db: Database): Router {
  const router = Router()

  // Scoped-guest read: a linked contact's own instance polls this to refresh
  // the locations I've published to them — filtered by visibility/trust group,
  // never the raw table. See tunnelAgent.shareContactLocations().
  router.get('/shared-locations', (req, res) => {
    const access = accessOf(req)
    if (access?.kind !== 'scoped' || !access.contactLocations) {
      res.status(403).json({ error: 'no contact-location grant' })
      return
    }
    const groups = getTrustGroups(db)
    const all = getContactLocations(db)
    const visible = all.filter((l) => canView(l.visibility, l.trustGroupId, access.viewerEmail ?? null, groups))
    res.json(visible)
  })

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
      description: body.description,
      address: body.address,
      location: body.location,
      linkedAccount: body.linkedAccount,
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

  // ── Prepared messages — one persistent draft per contact ─────────────────
  // REST shape matches @muralink/spaces makeHttpSpace so a host can register
  // an orchester space at path '/api/contacts/prepared-messages'.

  router.get('/prepared-messages', (req, res) => {
    const contactId = req.query['contactId'] ? String(req.query['contactId']) : undefined
    res.json(getPreparedMessages(db, contactId))
  })

  router.get('/prepared-messages/:id', (req, res) => {
    const msg = getPreparedMessage(db, req.params['id']!)
    if (!msg) { res.status(404).json({ error: 'not found' }); return }
    res.json(msg)
  })

  router.post('/prepared-messages', (req, res) => {
    const body = req.body as Partial<YPreparedMessage>
    if (!body.contactId) { res.status(400).json({ error: 'contactId required' }); return }
    // Deterministic id: one prepared message per contact, upsert semantics.
    const msg = upsertPreparedMessage(db, {
      id: body.id ?? preparedMessageId(body.contactId),
      contactId: body.contactId,
      body: body.body ?? '',
      updatedAt: body.updatedAt ?? new Date().toISOString(),
    })
    res.status(201).json(msg)
  })

  router.patch('/prepared-messages/:id', (req, res) => {
    const existing = getPreparedMessage(db, req.params['id']!)
    if (!existing) { res.status(404).json({ error: 'not found' }); return }
    const patch = req.body as Partial<YPreparedMessage>
    const msg = upsertPreparedMessage(db, {
      ...existing,
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    })
    res.json(msg)
  })

  router.delete('/prepared-messages/:id', (req, res) => {
    const deleted = deletePreparedMessage(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // ── Trust groups — master-only CRUD, no scoped-guest access ──────────────

  router.get('/trust-groups', (_req, res) => {
    res.json(getTrustGroups(db))
  })

  router.post('/trust-groups', (req, res) => {
    const body = req.body as Partial<TrustGroup>
    const now = new Date().toISOString()
    const group = createTrustGroup(db, {
      id: randomUUID(),
      name: body.name ?? 'Nuevo grupo',
      memberEmails: body.memberEmails ?? [],
      createdAt: now,
    })
    res.status(201).json(group)
  })

  router.patch('/trust-groups/:id', (req, res) => {
    const updated = updateTrustGroup(db, req.params['id']!, req.body as Partial<Omit<TrustGroup, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/trust-groups/:id', (req, res) => {
    const deleted = deleteTrustGroup(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // ── My own published locations — master-only CRUD. Guests read them
  // through the scoped '/shared-locations' route below, gated by canView. ──

  router.get('/locations', (_req, res) => {
    res.json(getContactLocations(db))
  })

  router.post('/locations', (req, res) => {
    const body = req.body as Partial<YContactLocation>
    if (!body.point) { res.status(400).json({ error: 'point required' }); return }
    const now = new Date().toISOString()
    const loc = createContactLocation(db, {
      id: randomUUID(),
      label: body.label,
      point: body.point,
      address: body.address,
      startAt: body.startAt ?? { iso: now, timezone: 'UTC' },
      endAt: body.endAt,
      visibility: body.visibility ?? 'private',
      trustGroupId: body.trustGroupId,
      createdAt: now,
    })
    res.status(201).json(loc)
  })

  router.patch('/locations/:id', (req, res) => {
    const updated = updateContactLocation(db, req.params['id']!, req.body as Partial<Omit<YContactLocation, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/locations/:id', (req, res) => {
    const deleted = deleteContactLocation(db, req.params['id']!)
    if (!deleted) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
