import type { Database } from 'better-sqlite3'
import type {
  YCalendarType,
  CalendarTypeKind,
  YAttendanceEntry,
  YVacationRequest,
  VacationRequestStatus,
  VacationRequestKind,
  YAttendanceAvailability,
} from '../../types.ts'

// ── Calendar types ──────────────────────────────────────────────────────────

interface CalendarTypeRow {
  id: string
  employee_id: string | null
  name: string
  kind: string
  color: string | null
  external_provider: string | null
  external_calendar_id: string | null
  sync_enabled: number
  created_at: string
}

function rowToCalendarType(row: CalendarTypeRow): YCalendarType {
  return {
    id: row.id,
    employeeId: row.employee_id ?? undefined,
    name: row.name,
    kind: row.kind as CalendarTypeKind,
    color: row.color ?? undefined,
    externalProvider: (row.external_provider as 'google' | 'outlook' | null) ?? undefined,
    externalCalendarId: row.external_calendar_id ?? undefined,
    syncEnabled: row.sync_enabled === 1,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
  }
}

export function getCalendarTypes(db: Database, employeeId?: string): YCalendarType[] {
  if (employeeId) {
    // Own types + shared ones (employee_id IS NULL, e.g. company holidays).
    return db
      .prepare<[string], CalendarTypeRow>(
        `SELECT * FROM attendance_calendar_types WHERE employee_id = ? OR employee_id IS NULL ORDER BY name`,
      )
      .all(employeeId)
      .map(rowToCalendarType)
  }
  return db
    .prepare<[], CalendarTypeRow>(`SELECT * FROM attendance_calendar_types ORDER BY name`)
    .all()
    .map(rowToCalendarType)
}

export function getCalendarType(db: Database, id: string): YCalendarType | undefined {
  const row = db
    .prepare<[string], CalendarTypeRow>(`SELECT * FROM attendance_calendar_types WHERE id = ?`)
    .get(id)
  return row ? rowToCalendarType(row) : undefined
}

export function createCalendarType(db: Database, type: YCalendarType): YCalendarType {
  db.prepare(
    `INSERT INTO attendance_calendar_types
       (id, employee_id, name, kind, color, external_provider, external_calendar_id, sync_enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    type.id,
    type.employeeId ?? null,
    type.name,
    type.kind,
    type.color ?? null,
    type.externalProvider ?? null,
    type.externalCalendarId ?? null,
    type.syncEnabled ? 1 : 0,
    type.createdAt.iso,
  )
  return getCalendarType(db, type.id)!
}

export function updateCalendarType(
  db: Database,
  id: string,
  patch: Partial<Omit<YCalendarType, 'id' | 'createdAt'>>,
): YCalendarType | undefined {
  const existing = getCalendarType(db, id)
  if (!existing) return undefined
  const next = { ...existing, ...patch }
  db.prepare(
    `UPDATE attendance_calendar_types
       SET employee_id=?, name=?, kind=?, color=?, external_provider=?, external_calendar_id=?, sync_enabled=?
     WHERE id=?`,
  ).run(
    next.employeeId ?? null,
    next.name,
    next.kind,
    next.color ?? null,
    next.externalProvider ?? null,
    next.externalCalendarId ?? null,
    next.syncEnabled ? 1 : 0,
    id,
  )
  return getCalendarType(db, id)
}

export function deleteCalendarType(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM attendance_calendar_types WHERE id = ?`).run(id).changes > 0
}

// Find-or-create the default calendar type an employee's own actions
// (clock-in, an approved vacation request) fall back to when the caller does
// not pick one explicitly. One per (employeeId, kind).
export function ensureDefaultCalendarType(
  db: Database,
  employeeId: string,
  kind: CalendarTypeKind,
  name: string,
): YCalendarType {
  const existing = db
    .prepare<[string, string], CalendarTypeRow>(
      `SELECT * FROM attendance_calendar_types WHERE employee_id = ? AND kind = ? LIMIT 1`,
    )
    .get(employeeId, kind)
  if (existing) return rowToCalendarType(existing)
  return createCalendarType(db, {
    id: `catype-${employeeId}-${kind}`,
    employeeId,
    name,
    kind,
    syncEnabled: false,
    createdAt: { iso: new Date().toISOString(), timezone: 'UTC' },
  })
}

// ── Entries ──────────────────────────────────────────────────────────────────

interface EntryRow {
  id: string
  employee_id: string
  calendar_type_id: string
  planned_start: string | null
  planned_end: string | null
  recorded_start: string | null
  recorded_end: string | null
  vacation_request_id: string | null
  note: string | null
  created_by: string
  updated_at: string
}

function rowToEntry(row: EntryRow): YAttendanceEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    calendarTypeId: row.calendar_type_id,
    planned:
      row.planned_start && row.planned_end
        ? {
            start: { iso: row.planned_start, timezone: 'UTC' },
            end: { iso: row.planned_end, timezone: 'UTC' },
          }
        : undefined,
    recorded: row.recorded_start
      ? {
          start: { iso: row.recorded_start, timezone: 'UTC' },
          end: row.recorded_end ? { iso: row.recorded_end, timezone: 'UTC' } : undefined,
        }
      : undefined,
    vacationRequestId: row.vacation_request_id ?? undefined,
    note: row.note ?? undefined,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  }
}

export function getEntry(db: Database, id: string): YAttendanceEntry | undefined {
  const row = db.prepare<[string], EntryRow>(`SELECT * FROM attendance_entries WHERE id = ?`).get(id)
  return row ? rowToEntry(row) : undefined
}

export interface EntriesFilter {
  from?: string
  to?: string
  employeeIds?: string[]
}

// Overlap filter, applied to whichever half (planned/recorded) is present —
// same "still growing" treatment as tracker's getEntries for an open
// (end IS NULL) recorded span.
function entriesWhere(filter: EntriesFilter): { sql: string; params: (string | number)[] } {
  const clauses: string[] = []
  const params: (string | number)[] = []

  if (filter.employeeIds && filter.employeeIds.length > 0) {
    clauses.push(`employee_id IN (${filter.employeeIds.map(() => '?').join(',')})`)
    params.push(...filter.employeeIds)
  }

  const rangeClauses: string[] = []
  if (filter.from || filter.to) {
    const plannedParts: string[] = ['planned_start IS NOT NULL']
    const recordedParts: string[] = ['recorded_start IS NOT NULL']
    if (filter.to) { plannedParts.push('planned_start < ?'); params.push(filter.to) }
    if (filter.from) { plannedParts.push('planned_end > ?'); params.push(filter.from) }
    rangeClauses.push(`(${plannedParts.join(' AND ')})`)
    if (filter.to) { recordedParts.push('recorded_start < ?'); params.push(filter.to) }
    if (filter.from) { recordedParts.push('(recorded_end IS NULL OR recorded_end > ?)'); params.push(filter.from) }
    rangeClauses.push(`(${recordedParts.join(' AND ')})`)
    clauses.push(`(${rangeClauses.join(' OR ')})`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** Team calendar listing: entries in range, optionally scoped to a set of employees. */
export function getTeamEntries(db: Database, filter: EntriesFilter): YAttendanceEntry[] {
  const { sql, params } = entriesWhere(filter)
  const rows = db
    .prepare<(string | number)[], EntryRow>(
      `SELECT * FROM attendance_entries ${sql} ORDER BY COALESCE(planned_start, recorded_start)`,
    )
    .all(...params)
  return rows.map(rowToEntry)
}

export function createEntry(db: Database, entry: YAttendanceEntry): YAttendanceEntry {
  db.prepare(
    `INSERT INTO attendance_entries
       (id, employee_id, calendar_type_id, planned_start, planned_end, recorded_start, recorded_end, vacation_request_id, note, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.employeeId,
    entry.calendarTypeId,
    entry.planned?.start.iso ?? null,
    entry.planned?.end.iso ?? null,
    entry.recorded?.start.iso ?? null,
    entry.recorded?.end?.iso ?? null,
    entry.vacationRequestId ?? null,
    entry.note ?? null,
    entry.createdBy,
    entry.updatedAt,
  )
  return getEntry(db, entry.id)!
}

export function updateEntry(
  db: Database,
  id: string,
  patch: Partial<Omit<YAttendanceEntry, 'id' | 'employeeId' | 'createdBy'>>,
): YAttendanceEntry | undefined {
  const existing = getEntry(db, id)
  if (!existing) return undefined

  const calendarTypeId = patch.calendarTypeId ?? existing.calendarTypeId
  const planned = patch.planned !== undefined ? patch.planned : existing.planned
  const recorded = patch.recorded !== undefined ? patch.recorded : existing.recorded
  const vacationRequestId =
    patch.vacationRequestId !== undefined ? patch.vacationRequestId : existing.vacationRequestId
  const note = patch.note !== undefined ? patch.note : existing.note
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(
    `UPDATE attendance_entries
       SET calendar_type_id=?, planned_start=?, planned_end=?, recorded_start=?, recorded_end=?, vacation_request_id=?, note=?, updated_at=?
     WHERE id=?`,
  ).run(
    calendarTypeId,
    planned?.start.iso ?? null,
    planned?.end.iso ?? null,
    recorded?.start.iso ?? null,
    recorded?.end?.iso ?? null,
    vacationRequestId ?? null,
    note ?? null,
    updatedAt,
    id,
  )
  return getEntry(db, id)
}

export function deleteEntry(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM attendance_entries WHERE id = ?`).run(id).changes > 0
}

/** The employee's currently-open clock-in (recorded.start set, no recorded.end), if any. */
export function findRunningRecorded(db: Database, employeeId: string): YAttendanceEntry | undefined {
  const row = db
    .prepare<[string], EntryRow>(
      `SELECT * FROM attendance_entries WHERE employee_id = ? AND recorded_start IS NOT NULL AND recorded_end IS NULL LIMIT 1`,
    )
    .get(employeeId)
  return row ? rowToEntry(row) : undefined
}

/** True when `range` overlaps an existing PLANNED window of the same employee
 *  — a self-adjustment conflict check. Colleagues overlapping each other is
 *  fine; only the same employee's own planned schedule must stay conflict-free. */
export function findOverlaps(
  db: Database,
  employeeId: string,
  range: { start: string; end: string },
  excludeEntryId?: string,
): YAttendanceEntry[] {
  const rows = db
    .prepare<[string, string, string, string], EntryRow>(
      `SELECT * FROM attendance_entries
       WHERE employee_id = ? AND id <> ? AND planned_start IS NOT NULL
         AND planned_start < ? AND planned_end > ?`,
    )
    .all(employeeId, excludeEntryId ?? '', range.end, range.start)
  return rows.map(rowToEntry)
}

/** Derived free/busy for a set of employees — union of planned ∪ recorded
 *  windows clipped to [from, to). Not persisted; recomputed on every call. */
export function getTeamAvailability(
  db: Database,
  employeeIds: string[],
  from: string,
  to: string,
): YAttendanceAvailability[] {
  const entries = getTeamEntries(db, { from, to, employeeIds })
  const out: YAttendanceAvailability[] = []
  const nowIso = new Date().toISOString()

  for (const entry of entries) {
    if (entry.planned) {
      const start = entry.planned.start.iso > from ? entry.planned.start.iso : from
      const end = entry.planned.end.iso < to ? entry.planned.end.iso : to
      const seconds = Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000)
      out.push({
        employeeId: entry.employeeId,
        start: { iso: start, timezone: 'UTC' },
        duration: { seconds },
        busy: true,
        source: 'planned',
      })
    }
    if (entry.recorded) {
      const endIso = entry.recorded.end?.iso ?? nowIso
      const start = entry.recorded.start.iso > from ? entry.recorded.start.iso : from
      const end = endIso < to ? endIso : to
      const seconds = Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000)
      out.push({
        employeeId: entry.employeeId,
        start: { iso: start, timezone: 'UTC' },
        duration: { seconds },
        busy: true,
        source: 'recorded',
      })
    }
  }
  return out
}

// ── Vacation requests ───────────────────────────────────────────────────────

interface VacationRequestRow {
  id: string
  employee_id: string
  kind: string
  start: string
  end: string
  status: string
  reason: string | null
  requested_by: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  attendance_entry_id: string | null
  created_at: string
  updated_at: string
}

function rowToVacationRequest(row: VacationRequestRow): YVacationRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    kind: row.kind as VacationRequestKind,
    start: { iso: row.start, timezone: 'UTC' },
    end: { iso: row.end, timezone: 'UTC' },
    status: row.status as VacationRequestStatus,
    reason: row.reason ?? undefined,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? undefined,
    decidedAt: row.decided_at ? { iso: row.decided_at, timezone: 'UTC' } : undefined,
    decisionNote: row.decision_note ?? undefined,
    attendanceEntryId: row.attendance_entry_id ?? undefined,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
    updatedAt: row.updated_at,
  }
}

export function getVacationRequests(db: Database, employeeId?: string): YVacationRequest[] {
  if (employeeId) {
    return db
      .prepare<[string], VacationRequestRow>(
        `SELECT * FROM attendance_vacation_requests WHERE employee_id = ? ORDER BY created_at DESC`,
      )
      .all(employeeId)
      .map(rowToVacationRequest)
  }
  return db
    .prepare<[], VacationRequestRow>(`SELECT * FROM attendance_vacation_requests ORDER BY created_at DESC`)
    .all()
    .map(rowToVacationRequest)
}

export function getVacationRequest(db: Database, id: string): YVacationRequest | undefined {
  const row = db
    .prepare<[string], VacationRequestRow>(`SELECT * FROM attendance_vacation_requests WHERE id = ?`)
    .get(id)
  return row ? rowToVacationRequest(row) : undefined
}

export function createVacationRequest(db: Database, request: YVacationRequest): YVacationRequest {
  db.prepare(
    `INSERT INTO attendance_vacation_requests
       (id, employee_id, kind, start, end, status, reason, requested_by, decided_by, decided_at, decision_note, attendance_entry_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    request.id,
    request.employeeId,
    request.kind,
    request.start.iso,
    request.end.iso,
    request.status,
    request.reason ?? null,
    request.requestedBy,
    request.decidedBy ?? null,
    request.decidedAt?.iso ?? null,
    request.decisionNote ?? null,
    request.attendanceEntryId ?? null,
    request.createdAt.iso,
    request.updatedAt,
  )
  return getVacationRequest(db, request.id)!
}

export function updateVacationRequest(
  db: Database,
  id: string,
  patch: Partial<Omit<YVacationRequest, 'id' | 'employeeId' | 'createdAt'>>,
): YVacationRequest | undefined {
  const existing = getVacationRequest(db, id)
  if (!existing) return undefined
  const next = { ...existing, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() }
  db.prepare(
    `UPDATE attendance_vacation_requests
       SET kind=?, start=?, end=?, status=?, reason=?, decided_by=?, decided_at=?, decision_note=?, attendance_entry_id=?, updated_at=?
     WHERE id=?`,
  ).run(
    next.kind,
    next.start.iso,
    next.end.iso,
    next.status,
    next.reason ?? null,
    next.decidedBy ?? null,
    next.decidedAt?.iso ?? null,
    next.decisionNote ?? null,
    next.attendanceEntryId ?? null,
    next.updatedAt,
    id,
  )
  return getVacationRequest(db, id)
}

// ── Employees (read-only lookups into the module this one depends on) ───────
// Reading employees' role here — not just their id — is the one place
// attendance leans on the DAG edge for more than an FK: "is this employee a
// manager" gates vacation approve/reject in routes.ts.

interface EmployeeRoleRow {
  role: string
}

export function isManager(db: Database, employeeId: string): boolean {
  const row = db
    .prepare<[string], EmployeeRoleRow>(`SELECT role FROM employees WHERE id = ?`)
    .get(employeeId)
  return row?.role === 'manager'
}
