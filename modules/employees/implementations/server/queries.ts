import type { Database } from 'better-sqlite3'
import type { YEmployee, YShift, EmployeeRole } from '../../types.ts'

// ── Employees ────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string
  name: string
  role: string
  phone_number: string | null
  phone_country: string | null
  email: string | null
  color: string | null
  active: number
  created_at: string
}

function rowToEmployee(row: EmployeeRow): YEmployee {
  return {
    id: row.id,
    name: row.name,
    role: row.role as EmployeeRole,
    phone:
      row.phone_number && row.phone_country
        ? { number: row.phone_number, countryCode: row.phone_country }
        : undefined,
    email: row.email ? { address: row.email } : undefined,
    color: row.color ?? undefined,
    active: row.active === 1,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
  }
}

export function getEmployees(db: Database, activeOnly = false): YEmployee[] {
  const sql = activeOnly
    ? `SELECT * FROM employees WHERE active = 1 ORDER BY name`
    : `SELECT * FROM employees ORDER BY name`
  return db.prepare<[], EmployeeRow>(sql).all().map(rowToEmployee)
}

export function getEmployee(db: Database, id: string): YEmployee | undefined {
  const row = db.prepare<[string], EmployeeRow>(`SELECT * FROM employees WHERE id = ?`).get(id)
  return row ? rowToEmployee(row) : undefined
}

export function createEmployee(db: Database, employee: YEmployee): YEmployee {
  db.prepare(
    `INSERT INTO employees (id, name, role, phone_number, phone_country, email, color, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    employee.id,
    employee.name,
    employee.role,
    employee.phone?.number ?? null,
    employee.phone?.countryCode ?? null,
    employee.email?.address ?? null,
    employee.color ?? null,
    employee.active ? 1 : 0,
    employee.createdAt.iso,
  )
  return getEmployee(db, employee.id)!
}

export function updateEmployee(
  db: Database,
  id: string,
  patch: Partial<Omit<YEmployee, 'id' | 'createdAt'>>,
): YEmployee | undefined {
  const existing = getEmployee(db, id)
  if (!existing) return undefined
  const e = { ...existing, ...patch }
  db.prepare(
    `UPDATE employees SET name=?, role=?, phone_number=?, phone_country=?, email=?, color=?, active=? WHERE id=?`,
  ).run(
    e.name,
    e.role,
    e.phone?.number ?? null,
    e.phone?.countryCode ?? null,
    e.email?.address ?? null,
    e.color ?? null,
    e.active ? 1 : 0,
    id,
  )
  return getEmployee(db, id)
}

export function deleteEmployee(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM employees WHERE id = ?`).run(id).changes > 0
}

// ── Shifts ───────────────────────────────────────────────────────────────────

interface ShiftRow {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string
  notes: string | null
}

function rowToShift(row: ShiftRow): YShift {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes ?? undefined,
  }
}

export function getShifts(db: Database): YShift[] {
  return db.prepare<[], ShiftRow>(`SELECT * FROM shifts ORDER BY date, start_time`).all().map(rowToShift)
}

export function getShift(db: Database, id: string): YShift | undefined {
  const row = db.prepare<[string], ShiftRow>(`SELECT * FROM shifts WHERE id = ?`).get(id)
  return row ? rowToShift(row) : undefined
}

export function getShiftsByDate(db: Database, date: string): YShift[] {
  return db
    .prepare<[string], ShiftRow>(`SELECT * FROM shifts WHERE date = ? ORDER BY start_time`)
    .all(date)
    .map(rowToShift)
}

export function getShiftsByEmployee(db: Database, employeeId: string, from?: string, to?: string): YShift[] {
  if (from && to) {
    return db
      .prepare<[string, string, string], ShiftRow>(
        `SELECT * FROM shifts WHERE employee_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time`,
      )
      .all(employeeId, from, to)
      .map(rowToShift)
  }
  return db
    .prepare<[string], ShiftRow>(`SELECT * FROM shifts WHERE employee_id = ? ORDER BY date DESC, start_time`)
    .all(employeeId)
    .map(rowToShift)
}

export function createShift(db: Database, shift: YShift): YShift {
  db.prepare(
    `INSERT INTO shifts (id, employee_id, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(shift.id, shift.employeeId, shift.date, shift.startTime, shift.endTime, shift.notes ?? null)
  return getShift(db, shift.id)!
}

export function updateShift(
  db: Database,
  id: string,
  patch: Partial<Omit<YShift, 'id' | 'employeeId'>>,
): YShift | undefined {
  const existing = getShift(db, id)
  if (!existing) return undefined
  const s = { ...existing, ...patch }
  db.prepare(
    `UPDATE shifts SET date=?, start_time=?, end_time=?, notes=? WHERE id=?`,
  ).run(s.date, s.startTime, s.endTime, s.notes ?? null, id)
  return getShift(db, id)
}

export function deleteShift(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM shifts WHERE id = ?`).run(id).changes > 0
}
