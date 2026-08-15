export const schema = `
CREATE TABLE IF NOT EXISTS tracker_timers (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  emoji       TEXT,
  color       TEXT,
  mural_id    TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracker_entries (
  id          TEXT PRIMARY KEY,
  timer_id    TEXT NOT NULL,
  start_iso   TEXT NOT NULL,
  start_tz    TEXT,
  end_iso     TEXT,
  end_tz      TEXT,
  note        TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracker_entries_timer ON tracker_entries (timer_id);
CREATE INDEX IF NOT EXISTS idx_tracker_entries_start ON tracker_entries (start_iso);
`
