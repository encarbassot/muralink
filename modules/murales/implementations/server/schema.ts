export const schema = `
CREATE TABLE IF NOT EXISTS murales (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  doc         TEXT NOT NULL DEFAULT '{}',
  public      INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_murales_updated ON murales (updated_at);
`
