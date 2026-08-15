export const schema = `
CREATE TABLE IF NOT EXISTS expense_entries (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  amount       INTEGER NOT NULL,   -- signed minor units (céntimos), + in my favour
  currency     TEXT NOT NULL,
  precision    INTEGER NOT NULL,
  provided_by  TEXT NOT NULL,      -- 'me' | 'them'
  description  TEXT NOT NULL,
  date_text    TEXT,
  hours        REAL,
  km           REAL,
  notes        TEXT,
  url_raw      TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_account ON expense_entries (account_id);
`
