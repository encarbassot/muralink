import type { Database } from 'better-sqlite3'
import type { YItem, YStockMovement, StockMovementType } from '../../types.ts'

// ── Items ────────────────────────────────────────────────────────────────────

interface ItemRow {
  id: string
  name: string
  sku: string | null
  category: string | null
  quantity: number
  unit: string
  min_stock: number | null
  price_amount: number | null
  price_currency: string | null
  price_precision: number | null
  created_at: string
}

function rowToItem(row: ItemRow): YItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    quantity: row.quantity,
    unit: row.unit,
    minStock: row.min_stock ?? undefined,
    price:
      row.price_amount !== null && row.price_currency && row.price_precision !== null
        ? { amount: row.price_amount, currency: row.price_currency, precision: row.price_precision }
        : undefined,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
  }
}

export function getItems(db: Database): YItem[] {
  return db.prepare<[], ItemRow>(`SELECT * FROM items ORDER BY name`).all().map(rowToItem)
}

export function getItem(db: Database, id: string): YItem | undefined {
  const row = db.prepare<[string], ItemRow>(`SELECT * FROM items WHERE id = ?`).get(id)
  return row ? rowToItem(row) : undefined
}

export function getLowStockItems(db: Database): YItem[] {
  return db
    .prepare<[], ItemRow>(`SELECT * FROM items WHERE min_stock IS NOT NULL AND quantity <= min_stock ORDER BY name`)
    .all()
    .map(rowToItem)
}

export function createItem(db: Database, item: YItem): YItem {
  db.prepare(
    `INSERT INTO items (id, name, sku, category, quantity, unit, min_stock, price_amount, price_currency, price_precision, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.name,
    item.sku ?? null,
    item.category ?? null,
    item.quantity,
    item.unit,
    item.minStock ?? null,
    item.price?.amount ?? null,
    item.price?.currency ?? null,
    item.price?.precision ?? null,
    item.createdAt.iso,
  )
  return getItem(db, item.id)!
}

export function updateItem(
  db: Database,
  id: string,
  patch: Partial<Omit<YItem, 'id' | 'createdAt'>>,
): YItem | undefined {
  const existing = getItem(db, id)
  if (!existing) return undefined
  const i = { ...existing, ...patch }
  db.prepare(
    `UPDATE items SET name=?, sku=?, category=?, quantity=?, unit=?, min_stock=?, price_amount=?, price_currency=?, price_precision=? WHERE id=?`,
  ).run(
    i.name,
    i.sku ?? null,
    i.category ?? null,
    i.quantity,
    i.unit,
    i.minStock ?? null,
    i.price?.amount ?? null,
    i.price?.currency ?? null,
    i.price?.precision ?? null,
    id,
  )
  return getItem(db, id)
}

export function deleteItem(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM items WHERE id = ?`).run(id).changes > 0
}

// ── Stock movements ──────────────────────────────────────────────────────────

interface MovementRow {
  id: string
  item_id: string
  type: string
  quantity: number
  reason: string | null
  performed_at: string
}

function rowToMovement(row: MovementRow): YStockMovement {
  return {
    id: row.id,
    itemId: row.item_id,
    type: row.type as StockMovementType,
    quantity: row.quantity,
    reason: row.reason ?? undefined,
    performedAt: { iso: row.performed_at, timezone: 'UTC' },
  }
}

export function getMovementHistory(db: Database, itemId: string): YStockMovement[] {
  return db
    .prepare<[string], MovementRow>(
      `SELECT * FROM stock_movements WHERE item_id = ? ORDER BY performed_at DESC`,
    )
    .all(itemId)
    .map(rowToMovement)
}

export function recordMovement(db: Database, movement: YStockMovement): YStockMovement {
  db.prepare(
    `INSERT INTO stock_movements (id, item_id, type, quantity, reason, performed_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    movement.id,
    movement.itemId,
    movement.type,
    movement.quantity,
    movement.reason ?? null,
    movement.performedAt.iso,
  )
  // Apply quantity delta to item
  db.prepare(`UPDATE items SET quantity = quantity + ? WHERE id = ?`).run(movement.quantity, movement.itemId)
  return movement
}
