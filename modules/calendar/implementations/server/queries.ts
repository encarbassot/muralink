import type { Database } from 'better-sqlite3'
import type { YBlock, YFacet } from '@muralink/types'
import type { YCalendarEvent } from '../../types.ts'

export interface EventRow {
  id: string
  title: string
  start_iso: string
  end_iso: string
  timezone: string
  all_day: number
  rrule: string | null
  blocks: string | null
  facets: string | null
  metadata: string | null
  google_id: string | null
  google_etag: string | null
  created_at: string
}

export function rowToEvent(row: EventRow): YCalendarEvent {
  const durationMs =
    new Date(row.end_iso).getTime() - new Date(row.start_iso).getTime()
  return {
    id: row.id,
    title: row.title,
    start: { iso: row.start_iso, timezone: row.timezone },
    end: { iso: row.end_iso, timezone: row.timezone },
    duration: { seconds: Math.round(durationMs / 1000) },
    allDay: row.all_day === 1,
    rrule: row.rrule ?? undefined,
    blocks: row.blocks ? (JSON.parse(row.blocks) as YBlock[]) : undefined,
    facets: row.facets ? (JSON.parse(row.facets) as YFacet[]) : undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, string>) : undefined,
    googleId: row.google_id ?? undefined,
    googleEtag: row.google_etag ?? undefined,
  }
}

export function getEvents(db: Database, from: string, to: string): YCalendarEvent[] {
  // Overlap semantics (not "starts inside the window") so multi-day events
  // crossing the window start still appear. Recurring events are returned
  // whenever their base start precedes the window end — the client expands
  // occurrences and drops rules that ended before the window.
  const rows = db
    .prepare<[string, string, string], EventRow>(
      `SELECT * FROM events
       WHERE (start_iso < ? AND end_iso > ?)
          OR (rrule IS NOT NULL AND rrule != '' AND start_iso < ?)
       ORDER BY start_iso`,
    )
    .all(to, from, to)
  return rows.map(rowToEvent)
}

export function getEvent(db: Database, id: string): YCalendarEvent | undefined {
  const row = db
    .prepare<[string], EventRow>(`SELECT * FROM events WHERE id = ?`)
    .get(id)
  return row ? rowToEvent(row) : undefined
}

export function createEvent(
  db: Database,
  event: Omit<YCalendarEvent, 'duration'>,
): YCalendarEvent {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO events (id, title, start_iso, end_iso, timezone, all_day, rrule, blocks, facets, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.title,
    event.start.iso,
    event.end.iso,
    event.start.timezone,
    event.allDay ? 1 : 0,
    event.rrule || null,
    event.blocks ? JSON.stringify(event.blocks) : null,
    event.facets ? JSON.stringify(event.facets) : null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    now,
  )
  return getEvent(db, event.id)!
}

export function updateEvent(
  db: Database,
  id: string,
  patch: Partial<Omit<YCalendarEvent, 'id' | 'duration'>>,
): YCalendarEvent | undefined {
  const existing = getEvent(db, id)
  if (!existing) return undefined

  const title = patch.title ?? existing.title
  const startIso = patch.start?.iso ?? existing.start.iso
  const endIso = patch.end?.iso ?? existing.end.iso
  const timezone = patch.start?.timezone ?? existing.start.timezone
  const allDay = patch.allDay ?? existing.allDay
  // Empty string clears the recurrence (stored as NULL); undefined keeps it.
  const rrule = patch.rrule === undefined ? existing.rrule : patch.rrule || undefined
  const blocks = patch.blocks === undefined ? existing.blocks : patch.blocks
  // undefined keeps existing facets — sync-origin patches never carry them.
  const facets = patch.facets === undefined ? existing.facets : patch.facets
  const metadata = patch.metadata ?? existing.metadata

  db.prepare(
    `UPDATE events SET title=?, start_iso=?, end_iso=?, timezone=?, all_day=?, rrule=?, blocks=?, facets=?, metadata=? WHERE id=?`,
  ).run(
    title,
    startIso,
    endIso,
    timezone,
    allDay ? 1 : 0,
    rrule ?? null,
    blocks ? JSON.stringify(blocks) : null,
    facets ? JSON.stringify(facets) : null,
    metadata ? JSON.stringify(metadata) : null,
    id,
  )
  return getEvent(db, id)
}

export function deleteEvent(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM events WHERE id = ?`).run(id)
  return result.changes > 0
}
