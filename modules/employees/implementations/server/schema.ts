export const schema = `
CREATE TABLE IF NOT EXISTS employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  phone_number  TEXT,
  phone_country TEXT,
  email         TEXT,
  color         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date        TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  notes       TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts (employee_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date     ON shifts (date);
`
