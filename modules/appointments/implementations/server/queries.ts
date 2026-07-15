import type { Database } from 'better-sqlite3'
import type { YAppointment, YService, AppointmentStatus, YAvailableSlot } from '../../types.ts'

// ── Services ────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  name: string
  duration_seconds: number
  price_amount: number | null
  price_currency: string | null
  price_precision: number | null
  description: string | null
}

function rowToService(row: ServiceRow): YService {
  return {
    id: row.id,
    name: row.name,
    durationSeconds: row.duration_seconds,
    price:
      row.price_amount !== null && row.price_currency && row.price_precision !== null
        ? { amount: row.price_amount, currency: row.price_currency, precision: row.price_precision }
        : undefined,
    description: row.description ?? undefined,
  }
}

export function getServices(db: Database): YService[] {
  return db.prepare<[], ServiceRow>(`SELECT * FROM services ORDER BY name`).all().map(rowToService)
}

export function getService(db: Database, id: string): YService | undefined {
  const row = db.prepare<[string], ServiceRow>(`SELECT * FROM services WHERE id = ?`).get(id)
  return row ? rowToService(row) : undefined
}

export function createService(db: Database, service: YService): YService {
  db.prepare(
    `INSERT INTO services (id, name, duration_seconds, price_amount, price_currency, price_precision, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    service.id,
    service.name,
    service.durationSeconds,
    service.price?.amount ?? null,
    service.price?.currency ?? null,
    service.price?.precision ?? null,
    service.description ?? null,
  )
  return getService(db, service.id)!
}

export function updateService(
  db: Database,
  id: string,
  patch: Partial<Omit<YService, 'id'>>,
): YService | undefined {
  const existing = getService(db, id)
  if (!existing) return undefined
  const s = { ...existing, ...patch }
  db.prepare(
    `UPDATE services SET name=?, duration_seconds=?, price_amount=?, price_currency=?, price_precision=?, description=? WHERE id=?`,
  ).run(
    s.name,
    s.durationSeconds,
    s.price?.amount ?? null,
    s.price?.currency ?? null,
    s.price?.precision ?? null,
    s.description ?? null,
    id,
  )
  return getService(db, id)
}

export function deleteService(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM services WHERE id = ?`).run(id).changes > 0
}

// ── Appointments ─────────────────────────────────────────────────────────────

interface AppointmentRow {
  id: string
  contact_id: string
  service_id: string
  start_iso: string
  timezone: string
  duration_seconds: number
  status: string
  notes: string | null
  created_at: string
}

function rowToAppointment(row: AppointmentRow): YAppointment {
  return {
    id: row.id,
    contactId: row.contact_id,
    serviceId: row.service_id,
    start: { iso: row.start_iso, timezone: row.timezone },
    duration: { seconds: row.duration_seconds },
    status: row.status as AppointmentStatus,
    notes: row.notes ?? undefined,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
  }
}

export function getAppointments(db: Database, from?: string, to?: string): YAppointment[] {
  if (from && to) {
    return db
      .prepare<[string, string], AppointmentRow>(
        `SELECT * FROM appointments WHERE start_iso >= ? AND start_iso < ? ORDER BY start_iso`,
      )
      .all(from, to)
      .map(rowToAppointment)
  }
  return db
    .prepare<[], AppointmentRow>(`SELECT * FROM appointments ORDER BY start_iso DESC`)
    .all()
    .map(rowToAppointment)
}

export function getAppointment(db: Database, id: string): YAppointment | undefined {
  const row = db.prepare<[string], AppointmentRow>(`SELECT * FROM appointments WHERE id = ?`).get(id)
  return row ? rowToAppointment(row) : undefined
}

export function getAppointmentsByContact(db: Database, contactId: string): YAppointment[] {
  return db
    .prepare<[string], AppointmentRow>(
      `SELECT * FROM appointments WHERE contact_id = ? ORDER BY start_iso DESC`,
    )
    .all(contactId)
    .map(rowToAppointment)
}

export function createAppointment(db: Database, appointment: YAppointment): YAppointment {
  db.prepare(
    `INSERT INTO appointments (id, contact_id, service_id, start_iso, timezone, duration_seconds, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    appointment.id,
    appointment.contactId,
    appointment.serviceId,
    appointment.start.iso,
    appointment.start.timezone,
    appointment.duration.seconds,
    appointment.status,
    appointment.notes ?? null,
    appointment.createdAt.iso,
  )
  return getAppointment(db, appointment.id)!
}

export function updateAppointment(
  db: Database,
  id: string,
  patch: Partial<Omit<YAppointment, 'id' | 'createdAt'>>,
): YAppointment | undefined {
  const existing = getAppointment(db, id)
  if (!existing) return undefined
  const a = { ...existing, ...patch }
  db.prepare(
    `UPDATE appointments SET contact_id=?, service_id=?, start_iso=?, timezone=?, duration_seconds=?, status=?, notes=? WHERE id=?`,
  ).run(
    a.contactId,
    a.serviceId,
    a.start.iso,
    a.start.timezone,
    a.duration.seconds,
    a.status,
    a.notes ?? null,
    id,
  )
  return getAppointment(db, id)
}

export function deleteAppointment(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM appointments WHERE id = ?`).run(id).changes > 0
}

// ── Available slots ──────────────────────────────────────────────────────────

interface WorkingHours {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  slotMinutes: number
  workingDays: number[]
}

export function getAvailableSlots(
  db: Database,
  dateIso: string,
  serviceId: string,
  hours: WorkingHours,
): YAvailableSlot[] {
  const service = getService(db, serviceId)
  if (!service) return []

  const date = new Date(dateIso)
  const dayOfWeek = date.getUTCDay()
  if (!hours.workingDays.includes(dayOfWeek)) return []

  const dayStart = new Date(date)
  dayStart.setUTCHours(hours.startHour, hours.startMinute, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setUTCHours(hours.endHour, hours.endMinute, 0, 0)

  const slotMs = hours.slotMinutes * 60 * 1000
  const serviceDurationMs = service.durationSeconds * 1000

  const dayStartIso = dayStart.toISOString()
  const dayEndIso = dayEnd.toISOString()

  const existingAppts = db
    .prepare<[string, string], { start_iso: string; duration_seconds: number }>(
      `SELECT start_iso, duration_seconds FROM appointments
       WHERE start_iso >= ? AND start_iso < ?
       AND status NOT IN ('cancelled', 'no-show')`,
    )
    .all(dayStartIso, dayEndIso)

  const slots: YAvailableSlot[] = []
  let cursor = dayStart.getTime()

  while (cursor + serviceDurationMs <= dayEnd.getTime()) {
    const slotStart = cursor
    const slotEnd = cursor + serviceDurationMs

    const occupied = existingAppts.some(appt => {
      const apptStart = new Date(appt.start_iso).getTime()
      const apptEnd = apptStart + appt.duration_seconds * 1000
      return slotStart < apptEnd && slotEnd > apptStart
    })

    if (!occupied) {
      slots.push({
        start: { iso: new Date(slotStart).toISOString(), timezone: 'UTC' },
        durationSeconds: service.durationSeconds,
      })
    }

    cursor += slotMs
  }

  return slots
}
