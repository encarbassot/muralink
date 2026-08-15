// attendance_entries.employee_id (and calendar_types', vacation_requests')
// FK to employees(id) is the concrete expression of manifest.ts'
// `dependencies: ['employees']` — both tables live in the same orchester
// sqlite db (see platforms/server/src/index.ts), so the FK is real, not just
// documentation.

export const schema = `
CREATE TABLE IF NOT EXISTS attendance_calendar_types (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT REFERENCES employees(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  color                 TEXT,
  external_provider     TEXT,
  external_calendar_id  TEXT,
  sync_enabled          INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_calendar_types_employee ON attendance_calendar_types (employee_id);

CREATE TABLE IF NOT EXISTS attendance_entries (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  calendar_type_id      TEXT NOT NULL REFERENCES attendance_calendar_types(id),
  planned_start         TEXT,
  planned_end           TEXT,
  recorded_start        TEXT,
  recorded_end          TEXT,
  vacation_request_id   TEXT,
  note                  TEXT,
  created_by            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_employee       ON attendance_entries (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_calendar_type  ON attendance_entries (calendar_type_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_planned_start  ON attendance_entries (planned_start);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_recorded_start ON attendance_entries (recorded_start);

CREATE TABLE IF NOT EXISTS attendance_vacation_requests (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,
  start                 TEXT NOT NULL,
  end                   TEXT NOT NULL,
  status                TEXT NOT NULL,
  reason                TEXT,
  requested_by          TEXT NOT NULL,
  decided_by            TEXT,
  decided_at            TEXT,
  decision_note         TEXT,
  attendance_entry_id   TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_vacation_employee ON attendance_vacation_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_vacation_status   ON attendance_vacation_requests (status);
`
