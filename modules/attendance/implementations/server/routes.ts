// Attendance REST routes, mounted at /api/attendance. The actor for
// self-service actions (clock-in/out, requesting a vacation) is always
// `req.access.userId` — never something the client puts in the body — so a
// federated-login employee can only fichar/request for themselves. See
// packages/multiuser/src/server.ts: in MULTIUSER mode that header is injected
// only after `users.verifySession(token)` succeeds, so it is trustworthy by
// the time it reaches here (same boundary contacts/routes.ts documents).

import { Router, type Request } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  getCalendarTypes,
  getCalendarType,
  createCalendarType,
  updateCalendarType,
  deleteCalendarType,
  ensureDefaultCalendarType,
  getTeamEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  findRunningRecorded,
  findOverlaps,
  getTeamAvailability,
  getVacationRequests,
  getVacationRequest,
  createVacationRequest,
  updateVacationRequest,
  isManager,
} from './queries.ts'
import type { YCalendarType, YAttendanceEntry, YVacationRequest } from '../../types.ts'

// Minimal structural view of the core's per-request access (platforms/server
// middleware/auth.ts) — the module can't import the platform (one-way deps).
interface AccessLike {
  kind: 'master' | 'scoped'
  userId?: string
}

function accessOf(req: Request): AccessLike | undefined {
  return (req as Request & { access?: AccessLike }).access
}

/** The employee id this request acts as. Federated login makes the muralink
 *  userId and the employees.id the same identity (see README "Auth federada"). */
function actorOf(req: Request): string | undefined {
  const access = accessOf(req)
  return access?.kind === 'master' ? access.userId : undefined
}

function now(): string {
  return new Date().toISOString()
}

export function createAttendanceRouter(db: Database): Router {
  const router = Router()

  // ── Calendar types ─────────────────────────────────────────────────────

  const calendarTypes = Router()

  calendarTypes.get('/', (req, res) => {
    const employeeId = typeof req.query['employeeId'] === 'string' ? req.query['employeeId'] : undefined
    res.json(getCalendarTypes(db, employeeId))
  })

  calendarTypes.get('/:id', (req, res) => {
    const type = getCalendarType(db, req.params['id']!)
    if (!type) { res.status(404).json({ error: 'not found' }); return }
    res.json(type)
  })

  calendarTypes.post('/', (req, res) => {
    const body = req.body as Partial<YCalendarType>
    if (!body.name || !body.kind) { res.status(400).json({ error: 'name and kind required' }); return }
    const type = createCalendarType(db, {
      id: body.id ?? randomUUID(),
      employeeId: body.employeeId,
      name: body.name,
      kind: body.kind,
      color: body.color,
      externalProvider: body.externalProvider,
      externalCalendarId: body.externalCalendarId,
      syncEnabled: body.syncEnabled ?? false,
      createdAt: body.createdAt ?? { iso: now(), timezone: 'UTC' },
    })
    res.status(201).json(type)
  })

  calendarTypes.patch('/:id', (req, res) => {
    const updated = updateCalendarType(db, req.params['id']!, req.body as Partial<Omit<YCalendarType, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  calendarTypes.delete('/:id', (req, res) => {
    if (!deleteCalendarType(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // ── Entries ────────────────────────────────────────────────────────────

  const entries = Router()

  entries.get('/', (req, res) => {
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined
    const employeeIds =
      typeof req.query['employeeIds'] === 'string' ? req.query['employeeIds'].split(',').filter(Boolean) : undefined
    res.json(getTeamEntries(db, { from, to, employeeIds }))
  })

  entries.get('/:id', (req, res) => {
    const entry = getEntry(db, req.params['id']!)
    if (!entry) { res.status(404).json({ error: 'not found' }); return }
    res.json(entry)
  })

  // Invariant (enforced here, not in types.ts): at least one of planned/recorded
  // must be present. A planned window on the SAME employee may not overlap an
  // existing one (self-adjustment conflict) — colleagues may overlap freely.
  entries.post('/', (req, res) => {
    const body = req.body as Partial<YAttendanceEntry>
    if (!body.employeeId || !body.calendarTypeId) {
      res.status(400).json({ error: 'employeeId and calendarTypeId required' })
      return
    }
    if (!body.planned && !body.recorded) {
      res.status(400).json({ error: 'at least one of planned or recorded is required' })
      return
    }
    if (body.planned) {
      const overlaps = findOverlaps(db, body.employeeId, {
        start: body.planned.start.iso,
        end: body.planned.end.iso,
      })
      if (overlaps.length > 0) {
        res.status(400).json({ error: 'overlaps an existing planned entry for this employee', overlaps })
        return
      }
    }
    const actor = actorOf(req)
    const entry = createEntry(db, {
      id: body.id ?? randomUUID(),
      employeeId: body.employeeId,
      calendarTypeId: body.calendarTypeId,
      planned: body.planned,
      recorded: body.recorded,
      vacationRequestId: body.vacationRequestId,
      note: body.note,
      createdBy: body.createdBy ?? actor ?? body.employeeId,
      updatedAt: body.updatedAt ?? now(),
    })
    res.status(201).json(entry)
  })

  entries.patch('/:id', (req, res) => {
    const id = req.params['id']!
    const existing = getEntry(db, id)
    if (!existing) { res.status(404).json({ error: 'not found' }); return }
    const patch = req.body as Partial<Omit<YAttendanceEntry, 'id' | 'employeeId' | 'createdBy'>>
    if (patch.planned) {
      const overlaps = findOverlaps(
        db,
        existing.employeeId,
        { start: patch.planned.start.iso, end: patch.planned.end.iso },
        id,
      )
      if (overlaps.length > 0) {
        res.status(400).json({ error: 'overlaps an existing planned entry for this employee', overlaps })
        return
      }
    }
    const updated = updateEntry(db, id, patch)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  entries.delete('/:id', (req, res) => {
    if (!deleteEntry(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // Self-service clock-in/out. Actor is always req.access.userId — the body
  // is never trusted for "who". A second clock-in while one is already open
  // reuses it (idempotent) instead of opening a second running span.
  entries.post('/clock-in', (req, res) => {
    const actor = actorOf(req)
    if (!actor) { res.status(401).json({ error: 'no authenticated employee for this request' }); return }
    const running = findRunningRecorded(db, actor)
    if (running) { res.json(running); return }

    const body = req.body as { calendarTypeId?: string; note?: string }
    const calendarTypeId =
      body.calendarTypeId ?? ensureDefaultCalendarType(db, actor, 'work', 'Trabajo').id
    const entry = createEntry(db, {
      id: randomUUID(),
      employeeId: actor,
      calendarTypeId,
      recorded: { start: { iso: now(), timezone: 'UTC' } },
      note: body.note,
      createdBy: actor,
      updatedAt: now(),
    })
    res.status(201).json(entry)
  })

  entries.post('/clock-out', (req, res) => {
    const actor = actorOf(req)
    if (!actor) { res.status(401).json({ error: 'no authenticated employee for this request' }); return }
    const running = findRunningRecorded(db, actor)
    if (!running) { res.status(404).json({ error: 'no open clock-in for this employee' }); return }
    const updated = updateEntry(db, running.id, {
      recorded: { start: running.recorded!.start, end: { iso: now(), timezone: 'UTC' } },
    })
    res.json(updated)
  })

  // ── Vacation requests ──────────────────────────────────────────────────

  const vacationRequests = Router()

  vacationRequests.post('/', (req, res) => {
    const actor = actorOf(req)
    if (!actor) { res.status(401).json({ error: 'no authenticated employee for this request' }); return }
    const body = req.body as Partial<YVacationRequest>
    if (!body.kind || !body.start?.iso || !body.end?.iso) {
      res.status(400).json({ error: 'kind, start and end required' })
      return
    }
    const request = createVacationRequest(db, {
      id: body.id ?? randomUUID(),
      employeeId: actor,
      kind: body.kind,
      start: body.start,
      end: body.end,
      status: 'pending',
      reason: body.reason,
      requestedBy: actor,
      createdAt: { iso: now(), timezone: 'UTC' },
      updatedAt: now(),
    })
    res.status(201).json(request)
  })

  // Own requests by default; a manager may pass ?employeeId= to see anyone's,
  // or omit it to see the whole team's.
  vacationRequests.get('/', (req, res) => {
    const actor = actorOf(req)
    const manager = actor ? isManager(db, actor) : false
    const queryEmployeeId =
      typeof req.query['employeeId'] === 'string' ? req.query['employeeId'] : undefined

    if (manager) {
      res.json(getVacationRequests(db, queryEmployeeId))
      return
    }
    if (!actor) { res.status(401).json({ error: 'no authenticated employee for this request' }); return }
    res.json(getVacationRequests(db, actor))
  })

  vacationRequests.post('/:id/approve', (req, res) => {
    const actor = actorOf(req)
    if (!actor || !isManager(db, actor)) { res.status(403).json({ error: 'manager role required' }); return }
    const request = getVacationRequest(db, req.params['id']!)
    if (!request) { res.status(404).json({ error: 'not found' }); return }
    if (request.status !== 'pending') { res.status(409).json({ error: `request is ${request.status}` }); return }

    const body = req.body as { decisionNote?: string }
    const result = db.transaction(() => {
      const vacationType = ensureDefaultCalendarType(db, request.employeeId, 'vacation', 'Vacaciones')
      const entry = createEntry(db, {
        id: randomUUID(),
        employeeId: request.employeeId,
        calendarTypeId: vacationType.id,
        planned: { start: request.start, end: request.end },
        vacationRequestId: request.id,
        createdBy: actor,
        updatedAt: now(),
      })
      const approved = updateVacationRequest(db, request.id, {
        status: 'approved',
        decidedBy: actor,
        decidedAt: { iso: now(), timezone: 'UTC' },
        decisionNote: body.decisionNote,
        attendanceEntryId: entry.id,
      })!
      return { request: approved, entry }
    })()
    res.json(result)
  })

  vacationRequests.post('/:id/reject', (req, res) => {
    const actor = actorOf(req)
    if (!actor || !isManager(db, actor)) { res.status(403).json({ error: 'manager role required' }); return }
    const request = getVacationRequest(db, req.params['id']!)
    if (!request) { res.status(404).json({ error: 'not found' }); return }
    if (request.status !== 'pending') { res.status(409).json({ error: `request is ${request.status}` }); return }

    const body = req.body as { decisionNote?: string }
    const rejected = updateVacationRequest(db, request.id, {
      status: 'rejected',
      decidedBy: actor,
      decidedAt: { iso: now(), timezone: 'UTC' },
      decisionNote: body.decisionNote,
    })
    res.json(rejected)
  })

  router.use('/calendar-types', calendarTypes)
  router.use('/entries', entries)
  router.use('/vacation-requests', vacationRequests)

  router.get('/team/availability', (req, res) => {
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined
    const employeeIds =
      typeof req.query['employeeIds'] === 'string' ? req.query['employeeIds'].split(',').filter(Boolean) : []
    if (!from || !to) { res.status(400).json({ error: 'from and to required' }); return }
    res.json(getTeamAvailability(db, employeeIds, from, to))
  })

  return router
}
