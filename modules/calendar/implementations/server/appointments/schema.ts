export const schema = `
CREATE TABLE IF NOT EXISTS services (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  price_amount      REAL,
  price_currency    TEXT,
  price_precision   INTEGER,
  description       TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id                TEXT PRIMARY KEY,
  contact_id        TEXT NOT NULL,
  service_id        TEXT NOT NULL,
  start_iso         TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  duration_seconds  INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'scheduled',
  notes             TEXT,
  created_at        TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_start     ON appointments (start_iso);
CREATE INDEX IF NOT EXISTS idx_appointments_contact   ON appointments (contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status    ON appointments (status);
`
