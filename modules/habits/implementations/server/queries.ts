import type { Database } from 'better-sqlite3'
import type { YHabitDef, YHabitCheck, HabitPolarity } from '../../types.ts'

// ── Habit definitions ─────────────────────────────────────────────────────────

interface HabitRow {
  id: string
  title: string
  icon: string | null
  polarity: string
  rrule: string | null
  reminder_id: string | null
  timer_id: string | null
  sort: number | null
  updated_at: string
}

function rowToHabit(row: HabitRow): YHabitDef {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon ?? '✅',
    polarity: (row.polarity === 'bad' ? 'bad' : 'good') as HabitPolarity,
    rrule: row.rrule ?? undefined,
    reminderId: row.reminder_id ?? undefined,
    timerId: row.timer_id ?? undefined,
    sort: row.sort ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function getHabits(db: Database): YHabitDef[] {
  const rows = db.prepare<[], HabitRow>(`SELECT * FROM habits ORDER BY sort, title`).all()
  return rows.map(rowToHabit)
}

export function getHabit(db: Database, id: string): YHabitDef | undefined {
  const row = db.prepare<[string], HabitRow>(`SELECT * FROM habits WHERE id = ?`).get(id)
  return row ? rowToHabit(row) : undefined
}

export function createHabit(db: Database, habit: YHabitDef): YHabitDef {
  db.prepare(
    `INSERT INTO habits (id, title, icon, polarity, rrule, reminder_id, timer_id, sort, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    habit.id,
    habit.title,
    habit.icon ?? null,
    habit.polarity,
    habit.rrule ?? null,
    habit.reminderId ?? null,
    habit.timerId ?? null,
    habit.sort ?? null,
    habit.updatedAt,
  )
  return getHabit(db, habit.id)!
}

export function updateHabit(
  db: Database,
  id: string,
  patch: Partial<Omit<YHabitDef, 'id'>>,
): YHabitDef | undefined {
  const existing = getHabit(db, id)
  if (!existing) return undefined

  const title = patch.title ?? existing.title
  const icon = patch.icon !== undefined ? patch.icon : existing.icon
  const polarity = patch.polarity ?? existing.polarity
  const rrule = patch.rrule !== undefined ? patch.rrule : existing.rrule
  const reminderId = patch.reminderId !== undefined ? patch.reminderId : existing.reminderId
  const timerId = patch.timerId !== undefined ? patch.timerId : existing.timerId
  const sort = patch.sort !== undefined ? patch.sort : existing.sort
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(
    `UPDATE habits SET title = ?, icon = ?, polarity = ?, rrule = ?, reminder_id = ?, timer_id = ?, sort = ?, updated_at = ? WHERE id = ?`,
  ).run(title, icon ?? null, polarity, rrule ?? null, reminderId ?? null, timerId ?? null, sort ?? null, updatedAt, id)
  return getHabit(db, id)
}

export function deleteHabit(db: Database, id: string): boolean {
  db.prepare(`DELETE FROM habit_checks WHERE habit_id = ?`).run(id)
  const result = db.prepare(`DELETE FROM habits WHERE id = ?`).run(id)
  return result.changes > 0
}

// ── Checks ────────────────────────────────────────────────────────────────────

interface CheckRow {
  id: string
  habit_id: string
  date: string
  checked_at: string
  updated_at: string
}

function rowToCheck(row: CheckRow): YHabitCheck {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    checkedAt: row.checked_at,
    updatedAt: row.updated_at,
  }
}

export function getChecks(db: Database, from?: string, to?: string): YHabitCheck[] {
  let sql = `SELECT * FROM habit_checks`
  const where: string[] = []
  const params: string[] = []
  // `date` keys are 'YYYY-MM-DD' — lexical compare == chronological compare.
  if (from) { where.push(`date >= ?`); params.push(from.slice(0, 10)) }
  if (to) { where.push(`date <= ?`); params.push(to.slice(0, 10)) }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY date DESC`
  const rows = db.prepare<string[], CheckRow>(sql).all(...params)
  return rows.map(rowToCheck)
}

export function getCheck(db: Database, id: string): YHabitCheck | undefined {
  const row = db.prepare<[string], CheckRow>(`SELECT * FROM habit_checks WHERE id = ?`).get(id)
  return row ? rowToCheck(row) : undefined
}

export function createCheck(db: Database, check: YHabitCheck): YHabitCheck {
  // Idempotent per (habit, day): re-creating an existing check returns the
  // existing row instead of violating UNIQUE(habit_id, date).
  const existing = db
    .prepare<[string, string], CheckRow>(`SELECT * FROM habit_checks WHERE habit_id = ? AND date = ?`)
    .get(check.habitId, check.date)
  if (existing) return rowToCheck(existing)
  db.prepare(
    `INSERT INTO habit_checks (id, habit_id, date, checked_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(check.id, check.habitId, check.date, check.checkedAt, check.updatedAt)
  return getCheck(db, check.id)!
}

export function deleteCheck(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM habit_checks WHERE id = ?`).run(id)
  return result.changes > 0
}
