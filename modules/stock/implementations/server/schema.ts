export const schema = `
CREATE TABLE IF NOT EXISTS stock_items (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  quantity            REAL NOT NULL DEFAULT 0,
  unit                TEXT NOT NULL DEFAULT 'unit',
  low_stock_threshold REAL,
  price_amount        REAL,
  price_currency      TEXT,
  price_precision     INTEGER,
  category            TEXT,
  notes               TEXT,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_category ON stock_items (category);
`
