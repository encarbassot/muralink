import type { Database } from 'better-sqlite3'
import type { YStockItem, YLocation, YPricing } from '../../types.ts'

interface StockRow {
  id: string
  name: string
  quantity: number
  unit: string
  low_stock_threshold: number | null
  price_amount: number | null
  price_currency: string | null
  price_precision: number | null
  category: string | null
  location_id: string | null
  notes: string | null
  pricing_json: string | null
  updated_at: string
}

function rowToItem(row: StockRow): YStockItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    lowStockThreshold: row.low_stock_threshold ?? undefined,
    price:
      row.price_amount !== null && row.price_currency && row.price_precision !== null
        ? { amount: row.price_amount, currency: row.price_currency, precision: row.price_precision }
        : undefined,
    pricing: row.pricing_json ? (JSON.parse(row.pricing_json) as YPricing) : undefined,
    category: row.category ?? undefined,
    locationId: row.location_id ?? undefined,
    notes: row.notes ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function getStockItems(db: Database, category?: string): YStockItem[] {
  if (category) {
    return db
      .prepare<[string], StockRow>('SELECT * FROM stock_items WHERE category = ? ORDER BY name')
      .all(category)
      .map(rowToItem)
  }
  return db.prepare<[], StockRow>('SELECT * FROM stock_items ORDER BY name').all().map(rowToItem)
}

export function getStockItem(db: Database, id: string): YStockItem | undefined {
  const row = db.prepare<[string], StockRow>('SELECT * FROM stock_items WHERE id = ?').get(id)
  return row ? rowToItem(row) : undefined
}

export function createStockItem(db: Database, item: YStockItem): YStockItem {
  db.prepare(
    `INSERT INTO stock_items (id, name, quantity, unit, low_stock_threshold, price_amount, price_currency, price_precision, category, location_id, notes, pricing_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id, item.name, item.quantity, item.unit,
    item.lowStockThreshold ?? null,
    item.price?.amount ?? null,
    item.price?.currency ?? null,
    item.price?.precision ?? null,
    item.category ?? null,
    item.locationId ?? null,
    item.notes ?? null,
    item.pricing ? JSON.stringify(item.pricing) : null,
    item.updatedAt,
  )
  return getStockItem(db, item.id)!
}

export function updateStockItem(
  db: Database,
  id: string,
  patch: Partial<Omit<YStockItem, 'id'>>,
): YStockItem | undefined {
  const existing = getStockItem(db, id)
  if (!existing) return undefined
  const i = { ...existing, ...patch, updatedAt: new Date().toISOString() }
  db.prepare(
    `UPDATE stock_items SET name=?, quantity=?, unit=?, low_stock_threshold=?, price_amount=?, price_currency=?, price_precision=?, category=?, location_id=?, notes=?, pricing_json=?, updated_at=? WHERE id=?`,
  ).run(
    i.name, i.quantity, i.unit,
    i.lowStockThreshold ?? null,
    i.price?.amount ?? null, i.price?.currency ?? null, i.price?.precision ?? null,
    i.category ?? null, i.locationId ?? null, i.notes ?? null,
    i.pricing ? JSON.stringify(i.pricing) : null,
    i.updatedAt, id,
  )
  return getStockItem(db, id)
}

export function adjustQuantity(db: Database, id: string, delta: number): YStockItem | undefined {
  const item = getStockItem(db, id)
  if (!item) return undefined
  return updateStockItem(db, id, { quantity: Math.max(0, item.quantity + delta) })
}

export function deleteStockItem(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM stock_items WHERE id = ?').run(id).changes > 0
}

export function getLowStockItems(db: Database): YStockItem[] {
  return db
    .prepare<[], StockRow>(
      'SELECT * FROM stock_items WHERE low_stock_threshold IS NOT NULL AND quantity <= low_stock_threshold ORDER BY quantity ASC',
    )
    .all()
    .map(rowToItem)
}

// ── Locations ────────────────────────────────────────────────────────────────

interface LocationRow {
  id: string
  name: string
  description: string | null
  created_at: string
}

function rowToLocation(row: LocationRow): YLocation {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  }
}

export function getLocations(db: Database): YLocation[] {
  return db
    .prepare<[], LocationRow>('SELECT * FROM stock_locations ORDER BY name')
    .all()
    .map(rowToLocation)
}

export function getLocation(db: Database, id: string): YLocation | undefined {
  const row = db.prepare<[string], LocationRow>('SELECT * FROM stock_locations WHERE id = ?').get(id)
  return row ? rowToLocation(row) : undefined
}

export function createLocation(db: Database, location: YLocation): YLocation {
  db.prepare(
    `INSERT INTO stock_locations (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
  ).run(location.id, location.name, location.description ?? null, location.createdAt)
  return getLocation(db, location.id)!
}

export function updateLocation(
  db: Database,
  id: string,
  patch: Partial<Omit<YLocation, 'id' | 'createdAt'>>,
): YLocation | undefined {
  const existing = getLocation(db, id)
  if (!existing) return undefined
  const l = { ...existing, ...patch }
  db.prepare(`UPDATE stock_locations SET name=?, description=? WHERE id=?`).run(
    l.name, l.description ?? null, id,
  )
  return getLocation(db, id)
}

// Deleting a location unlinks its items (they become unassigned) rather than
// deleting them — done explicitly so behaviour is the same on live DBs whether
// or not SQLite foreign-key enforcement is active.
export function deleteLocation(db: Database, id: string): boolean {
  db.prepare('UPDATE stock_items SET location_id = NULL WHERE location_id = ?').run(id)
  return db.prepare('DELETE FROM stock_locations WHERE id = ?').run(id).changes > 0
}
