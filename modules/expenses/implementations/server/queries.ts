import type { Database } from 'better-sqlite3'
import type { YExpenseEntry, ProvidedBy } from '../../types.ts'

interface EntryRow {
  id: string
  account_id: string
  amount: number
  currency: string
  precision: number
  provided_by: string
  description: string
  date_text: string | null
  hours: number | null
  km: number | null
  notes: string | null
  url_raw: string | null
  created_at: string
  updated_at: string | null
}

function rowToEntry(row: EntryRow): YExpenseEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    amount: { amount: row.amount, currency: row.currency, precision: row.precision },
    providedBy: (row.provided_by as ProvidedBy) ?? 'me',
    description: row.description,
    dateText: row.date_text ?? undefined,
    hours: row.hours ?? undefined,
    km: row.km ?? undefined,
    notes: row.notes ?? undefined,
    url: row.url_raw ? { raw: row.url_raw, normalized: row.url_raw, domain: '' } : undefined,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
    updatedAt: row.updated_at ?? undefined,
  }
}

export function getEntries(db: Database, accountId?: string): YExpenseEntry[] {
  if (accountId) {
    const rows = db
      .prepare<[string], EntryRow>(`SELECT * FROM expense_entries WHERE account_id = ? ORDER BY created_at`)
      .all(accountId)
    return rows.map(rowToEntry)
  }
  const rows = db.prepare<[], EntryRow>(`SELECT * FROM expense_entries ORDER BY created_at`).all()
  return rows.map(rowToEntry)
}

export function getEntry(db: Database, id: string): YExpenseEntry | undefined {
  const row = db.prepare<[string], EntryRow>(`SELECT * FROM expense_entries WHERE id = ?`).get(id)
  return row ? rowToEntry(row) : undefined
}

export function createEntry(db: Database, entry: YExpenseEntry): YExpenseEntry {
  db.prepare(
    `INSERT INTO expense_entries
       (id, account_id, amount, currency, precision, provided_by, description, date_text, hours, km, notes, url_raw, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.accountId,
    entry.amount.amount,
    entry.amount.currency,
    entry.amount.precision,
    entry.providedBy,
    entry.description,
    entry.dateText ?? null,
    entry.hours ?? null,
    entry.km ?? null,
    entry.notes ?? null,
    entry.url?.raw ?? null,
    entry.createdAt.iso,
    entry.updatedAt ?? null,
  )
  return getEntry(db, entry.id)!
}

export function updateEntry(
  db: Database,
  id: string,
  patch: Partial<Omit<YExpenseEntry, 'id' | 'createdAt'>>,
): YExpenseEntry | undefined {
  const existing = getEntry(db, id)
  if (!existing) return undefined

  const next: YExpenseEntry = {
    ...existing,
    ...patch,
    amount: patch.amount ?? existing.amount,
    updatedAt: new Date().toISOString(),
  }

  db.prepare(
    `UPDATE expense_entries SET
       account_id=?, amount=?, currency=?, precision=?, provided_by=?, description=?, date_text=?, hours=?, km=?, notes=?, url_raw=?, updated_at=?
     WHERE id=?`,
  ).run(
    next.accountId,
    next.amount.amount,
    next.amount.currency,
    next.amount.precision,
    next.providedBy,
    next.description,
    next.dateText ?? null,
    next.hours ?? null,
    next.km ?? null,
    next.notes ?? null,
    next.url?.raw ?? null,
    next.updatedAt ?? null,
    id,
  )
  return getEntry(db, id)
}

export function deleteEntry(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM expense_entries WHERE id = ?`).run(id)
  return result.changes > 0
}
