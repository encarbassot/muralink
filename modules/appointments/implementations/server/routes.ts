import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  getServices, getService, createService, updateService, deleteService,
  getAppointments, getAppointment, getAppointmentsByContact,
  createAppointment, updateAppointment, deleteAppointment, getAvailableSlots,
} from './queries.ts'
import type { YAppointment, YService } from '../../types.ts'

interface WorkingHoursConfig {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  slotMinutes: number
  workingDays: number[]
}

export function createAppointmentsRouter(db: Database, workingHours: WorkingHoursConfig): Router {
  const router = Router()

  // Services
  router.get('/services', (_req, res) => { res.json(getServices(db)) })
  router.get('/services/:id', (req, res) => {
    const s = getService(db, req.params['id']!)
    if (!s) { res.status(404).json({ error: 'not found' }); return }
    res.json(s)
  })
  router.post('/services', (req, res) => {
    const body = req.body as Omit<YService, 'id'>
    const service = createService(db, { id: randomUUID(), ...body })
    res.status(201).json(service)
  })
  router.patch('/services/:id', (req, res) => {
    const updated = updateService(db, req.params['id']!, req.body as Partial<Omit<YService, 'id'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })
  router.delete('/services/:id', (req, res) => {
    if (!deleteService(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // Available slots (public — no auth required, handled by caller)
  router.get('/slots', (req, res) => {
    const date = String(req.query['date'] ?? new Date().toISOString().slice(0, 10))
    const serviceId = String(req.query['serviceId'] ?? '')
    if (!serviceId) { res.status(400).json({ error: 'serviceId required' }); return }
    const slots = getAvailableSlots(db, date, serviceId, workingHours)
    res.json(slots)
  })

  // Appointments
  router.get('/appointments', (req, res) => {
    const from = req.query['from'] ? String(req.query['from']) : undefined
    const to = req.query['to'] ? String(req.query['to']) : undefined
    res.json(getAppointments(db, from, to))
  })

  router.get('/appointments/:id', (req, res) => {
    const a = getAppointment(db, req.params['id']!)
    if (!a) { res.status(404).json({ error: 'not found' }); return }
    res.json(a)
  })

  router.get('/contacts/:contactId/appointments', (req, res) => {
    res.json(getAppointmentsByContact(db, req.params['contactId']!))
  })

  router.post('/appointments', (req, res) => {
    const body = req.body as Omit<YAppointment, 'id' | 'createdAt' | 'status'>
    const now = new Date().toISOString()
    const service = getService(db, body.serviceId)
    if (!service) { res.status(400).json({ error: 'service not found' }); return }

    const appt = createAppointment(db, {
      id: randomUUID(),
      contactId: body.contactId,
      serviceId: body.serviceId,
      start: body.start,
      duration: body.duration ?? { seconds: service.durationSeconds },
      status: 'scheduled',
      notes: body.notes,
      createdAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(appt)
  })

  // Public booking — no auth, creates contact if needed
  router.post('/appointments/public', (req, res) => {
    const body = req.body as {
      contactId: string
      serviceId: string
      start: { iso: string; timezone: string }
      notes?: string
    }
    const now = new Date().toISOString()
    const service = getService(db, body.serviceId)
    if (!service) { res.status(400).json({ error: 'service not found' }); return }

    const appt = createAppointment(db, {
      id: randomUUID(),
      contactId: body.contactId,
      serviceId: body.serviceId,
      start: body.start,
      duration: { seconds: service.durationSeconds },
      status: 'scheduled',
      notes: body.notes,
      createdAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(appt)
  })

  router.patch('/appointments/:id', (req, res) => {
    const updated = updateAppointment(
      db,
      req.params['id']!,
      req.body as Parameters<typeof updateAppointment>[2],
    )
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/appointments/:id', (req, res) => {
    if (!deleteAppointment(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
