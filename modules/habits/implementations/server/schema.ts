export const schema = `
CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  icon        TEXT,
  polarity    TEXT NOT NULL DEFAULT 'good',
  rrule       TEXT,
  reminder_id TEXT,
  timer_id    TEXT,
  sort        INTEGER,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_checks (
  id          TEXT PRIMARY KEY,
  habit_id    TEXT NOT NULL,
  date        TEXT NOT NULL,
  checked_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habit_checks_date ON habit_checks (date);
`
