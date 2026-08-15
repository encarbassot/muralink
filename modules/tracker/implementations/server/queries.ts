import type { Database } from 'better-sqlite3'
import type { YTimerDef, YTimeEntry } from '../../types.ts'

// ── Timers ────────────────────────────────────────────────────────────────────

interface TimerRow {
  id: string
  title: string
  emoji: string | null
  color: string | null
  mural_id: string | null
  archived: number
  updated_at: string
}

function rowToTimer(row: TimerRow): YTimerDef {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? undefined,
    color: row.color ?? undefined,
    muralId: row.mural_id ?? undefined,
    archived: row.archived === 1 ? true : undefined,
    updatedAt: row.updated_at,
  }
}

export function getTimers(db: Database): YTimerDef[] {
  const rows = db.prepare<[], TimerRow>(`SELECT * FROM tracker_timers ORDER BY title`).all()
  return rows.map(rowToTimer)
}

export function getTimer(db: Database, id: string): YTimerDef | undefined {
  const row = db.prepare<[string], TimerRow>(`SELECT * FROM tracker_timers WHERE id = ?`).get(id)
  return row ? rowToTimer(row) : undefined
}

export function createTimer(db: Database, timer: YTimerDef): YTimerDef {
  db.prepare(
    `INSERT INTO tracker_timers (id, title, emoji, color, mural_id, archived, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    timer.id,
    timer.title,
    timer.emoji ?? null,
    timer.color ?? null,
    timer.muralId ?? null,
    timer.archived ? 1 : 0,
    timer.updatedAt,
  )
  return getTimer(db, timer.id)!
}

export function updateTimer(
  db: Database,
  id: string,
  patch: Partial<Omit<YTimerDef, 'id'>>,
): YTimerDef | undefined {
  const existing = getTimer(db, id)
  if (!existing) return undefined

  const title = patch.title ?? existing.title
  const emoji = patch.emoji !== undefined ? patch.emoji : existing.emoji
  const color = patch.color !== undefined ? patch.color : existing.color
  const muralId = patch.muralId !== undefined ? patch.muralId : existing.muralId
  const archived = patch.archived !== undefined ? patch.archived : existing.archived
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(
    `UPDATE tracker_timers SET title = ?, emoji = ?, color = ?, mural_id = ?, archived = ?, updated_at = ? WHERE id = ?`,
  ).run(title, emoji ?? null, color ?? null, muralId ?? null, archived ? 1 : 0, updatedAt, id)
  return getTimer(db, id)
}

export function deleteTimer(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM tracker_timers WHERE id = ?`).run(id)
  return result.changes > 0
}

// ── Entries ───────────────────────────────────────────────────────────────────

interface EntryRow {
  id: string
  timer_id: string
  start_iso: string
  start_tz: string | null
  end_iso: string | null
  end_tz: string | null
  note: string | null
  updated_at: string
}

function rowToEntry(row: EntryRow): YTimeEntry {
  return {
    id: row.id,
    timerId: row.timer_id,
    start: { iso: row.start_iso, timezone: row.start_tz ?? 'UTC' },
    end: row.end_iso ? { iso: row.end_iso, timezone: row.end_tz ?? row.start_tz ?? 'UTC' } : undefined,
    note: row.note ?? undefined,
    updatedAt: row.updated_at,
  }
}

// Overlap filter: open entries (end_iso NULL) always match past `from` — they
// are still growing, so the client clamps their end to now.
export function getEntries(db: Database, from?: string, to?: string): YTimeEntry[] {
  let sql = `SELECT * FROM tracker_entries`
  const where: string[] = []
  const params: string[] = []
  if (to) { where.push(`start_iso < ?`); params.push(to) }
  if (from) { where.push(`(end_iso IS NULL OR end_iso > ?)`); params.push(from) }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY start_iso DESC`
  const rows = db.prepare<string[], EntryRow>(sql).all(...params)
  return rows.map(rowToEntry)
}

export function getEntry(db: Database, id: string): YTimeEntry | undefined {
  const row = db.prepare<[string], EntryRow>(`SELECT * FROM tracker_entries WHERE id = ?`).get(id)
  return row ? rowToEntry(row) : undefined
}

export function createEntry(db: Database, entry: YTimeEntry): YTimeEntry {
  db.prepare(
    `INSERT INTO tracker_entries (id, timer_id, start_iso, start_tz, end_iso, end_tz, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.timerId,
    entry.start.iso,
    entry.start.timezone ?? null,
    entry.end?.iso ?? null,
    entry.end?.timezone ?? null,
    entry.note ?? null,
    entry.updatedAt,
  )
  return getEntry(db, entry.id)!
}

export function updateEntry(
  db: Database,
  id: string,
  patch: Partial<Omit<YTimeEntry, 'id'>>,
): YTimeEntry | undefined {
  const existing = getEntry(db, id)
  if (!existing) return undefined

  const timerId = patch.timerId ?? existing.timerId
  const start = patch.start ?? existing.start
  const end = patch.end !== undefined ? patch.end : existing.end
  const note = patch.note !== undefined ? patch.note : existing.note
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(
    `UPDATE tracker_entries SET timer_id = ?, start_iso = ?, start_tz = ?, end_iso = ?, end_tz = ?, note = ?, updated_at = ? WHERE id = ?`,
  ).run(timerId, start.iso, start.timezone ?? null, end?.iso ?? null, end?.timezone ?? null, note ?? null, updatedAt, id)
  return getEntry(db, id)
}

export function deleteEntry(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM tracker_entries WHERE id = ?`).run(id)
  return result.changes > 0
}
