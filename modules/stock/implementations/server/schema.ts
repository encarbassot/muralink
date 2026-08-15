import type { Database } from 'better-sqlite3'

export const schema = `
CREATE TABLE IF NOT EXISTS stock_locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL
);

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
  location_id         TEXT,
  notes               TEXT,
  pricing_json        TEXT,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_category ON stock_items (category);
`

// SQLite has no ADD COLUMN IF NOT EXISTS, so instances whose stock_items table
// predates locations get the location_id column patched in here. Runs AFTER
// exec(schema): the location_id index is created here (not in the schema string)
// because a pre-existing table lacks the column at schema-exec time. Location
// unlinking on delete is handled in queries (deleteLocation) so behaviour is
// identical whether or not the live DB enforces foreign keys.
export function migrateStock(db: Database): void {
  const cols = (db.prepare(`PRAGMA table_info(stock_items)`).all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!cols.includes('location_id')) db.exec(`ALTER TABLE stock_items ADD COLUMN location_id TEXT`)
  // Rich pricing (base/gain/final + rules) is stored as a JSON blob rather than
  // exploded columns, so the shape can grow without further migrations.
  if (!cols.includes('pricing_json')) db.exec(`ALTER TABLE stock_items ADD COLUMN pricing_json TEXT`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_location ON stock_items (location_id)`)
}
