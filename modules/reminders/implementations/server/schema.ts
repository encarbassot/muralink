export const schema = `
CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  due_at      TEXT,
  assignee    TEXT,
  created_by  TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (done, due_at);
`
