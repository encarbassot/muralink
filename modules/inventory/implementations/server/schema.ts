export const schema = `
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  sku           TEXT,
  category      TEXT,
  quantity      REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'units',
  min_stock     REAL,
  price_amount  REAL,
  price_currency TEXT,
  price_precision INTEGER,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL,
  type         TEXT NOT NULL,
  quantity     REAL NOT NULL,
  reason       TEXT,
  performed_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_items_category       ON items (category);
`
