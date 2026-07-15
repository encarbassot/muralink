import type { Database } from 'better-sqlite3'
import type { YContact } from '../../types.ts'

interface ContactRow {
  id: string
  name: string
  phone_number: string | null
  phone_country: string | null
  phone_label: string | null
  email_address: string | null
  email_label: string | null
  notes: string | null
  created_at: string
}

function rowToContact(row: ContactRow): YContact {
  return {
    id: row.id,
    name: row.name,
    phone:
      row.phone_number && row.phone_country
        ? { number: row.phone_number, countryCode: row.phone_country, label: row.phone_label ?? undefined }
        : undefined,
    email: row.email_address
      ? { address: row.email_address, label: row.email_label ?? undefined }
      : undefined,
    notes: row.notes ?? undefined,
    createdAt: { iso: row.created_at, timezone: 'UTC' },
  }
}

export function getContacts(db: Database, search?: string): YContact[] {
  if (search) {
    const rows = db
      .prepare<[string, string], ContactRow>(
        `SELECT * FROM contacts WHERE name LIKE ? OR email_address LIKE ? ORDER BY name`,
      )
      .all(`%${search}%`, `%${search}%`)
    return rows.map(rowToContact)
  }
  const rows = db.prepare<[], ContactRow>(`SELECT * FROM contacts ORDER BY name`).all()
  return rows.map(rowToContact)
}

export function getContact(db: Database, id: string): YContact | undefined {
  const row = db.prepare<[string], ContactRow>(`SELECT * FROM contacts WHERE id = ?`).get(id)
  return row ? rowToContact(row) : undefined
}

export function createContact(db: Database, contact: YContact): YContact {
  db.prepare(
    `INSERT INTO contacts (id, name, phone_number, phone_country, phone_label, email_address, email_label, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    contact.id,
    contact.name,
    contact.phone?.number ?? null,
    contact.phone?.countryCode ?? null,
    contact.phone?.label ?? null,
    contact.email?.address ?? null,
    contact.email?.label ?? null,
    contact.notes ?? null,
    contact.createdAt.iso,
  )
  return getContact(db, contact.id)!
}

export function updateContact(
  db: Database,
  id: string,
  patch: Partial<Omit<YContact, 'id' | 'createdAt'>>,
): YContact | undefined {
  const existing = getContact(db, id)
  if (!existing) return undefined

  const name = patch.name ?? existing.name
  const phone = patch.phone !== undefined ? patch.phone : existing.phone
  const email = patch.email !== undefined ? patch.email : existing.email
  const notes = patch.notes !== undefined ? patch.notes : existing.notes

  db.prepare(
    `UPDATE contacts SET name=?, phone_number=?, phone_country=?, phone_label=?, email_address=?, email_label=?, notes=? WHERE id=?`,
  ).run(
    name,
    phone?.number ?? null,
    phone?.countryCode ?? null,
    phone?.label ?? null,
    email?.address ?? null,
    email?.label ?? null,
    notes ?? null,
    id,
  )
  return getContact(db, id)
}

export function deleteContact(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id)
  return result.changes > 0
}
