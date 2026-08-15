import type { Database } from 'better-sqlite3'

export const schema = `
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  start_iso   TEXT NOT NULL,
  end_iso     TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  all_day     INTEGER NOT NULL DEFAULT 0,
  rrule       TEXT,
  blocks      TEXT,
  facets      TEXT,
  metadata    TEXT,
  google_id   TEXT,
  google_etag TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_iso);
`

// SQLite has no ADD COLUMN IF NOT EXISTS, so existing databases (created
// before rrule/blocks) are patched by inspecting the live table.
export function migrateCalendar(db: Database): void {
  const cols = (db.prepare(`PRAGMA table_info(events)`).all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!cols.includes('rrule')) db.exec(`ALTER TABLE events ADD COLUMN rrule TEXT`)
  if (!cols.includes('blocks')) db.exec(`ALTER TABLE events ADD COLUMN blocks TEXT`)
  if (!cols.includes('facets')) db.exec(`ALTER TABLE events ADD COLUMN facets TEXT`)
  if (!cols.includes('google_id')) db.exec(`ALTER TABLE events ADD COLUMN google_id TEXT`)
  if (!cols.includes('google_etag')) db.exec(`ALTER TABLE events ADD COLUMN google_etag TEXT`)
}
