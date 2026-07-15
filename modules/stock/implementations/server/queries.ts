import type { Database } from 'better-sqlite3'
import type { YStockItem } from '../../types.ts'

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
  notes: string | null
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
    category: row.category ?? undefined,
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
    `INSERT INTO stock_items (id, name, quantity, unit, low_stock_threshold, price_amount, price_currency, price_precision, category, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id, item.name, item.quantity, item.unit,
    item.lowStockThreshold ?? null,
    item.price?.amount ?? null,
    item.price?.currency ?? null,
    item.price?.precision ?? null,
    item.category ?? null,
    item.notes ?? null,
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
    `UPDATE stock_items SET name=?, quantity=?, unit=?, low_stock_threshold=?, price_amount=?, price_currency=?, price_precision=?, category=?, notes=?, updated_at=? WHERE id=?`,
  ).run(
    i.name, i.quantity, i.unit,
    i.lowStockThreshold ?? null,
    i.price?.amount ?? null, i.price?.currency ?? null, i.price?.precision ?? null,
    i.category ?? null, i.notes ?? null, i.updatedAt, id,
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
