export const schema = `
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  start_iso   TEXT NOT NULL,
  end_iso     TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  all_day     INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_iso);
`
