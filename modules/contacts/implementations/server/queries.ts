import type { Database } from 'better-sqlite3'
import type { TrustGroup, YVisibility } from '@muralink/types'
import type { YContact, YContactLocation, YPreparedMessage } from '../../types.ts'

interface ContactRow {
  id: string
  name: string
  phone_number: string | null
  phone_country: string | null
  phone_label: string | null
  email_address: string | null
  email_label: string | null
  notes: string | null
  description: string | null
  address: string | null
  location_text: string | null
  location_lat: number | null
  location_lon: number | null
  linked_account_url: string | null
  linked_account_status: string | null
  linked_account_synced_at: string | null
  created_at: string
}

function rowToContact(row: ContactRow): YContact {
  const location =
    row.location_text != null || (row.location_lat != null && row.location_lon != null)
      ? {
          text: row.location_text ?? undefined,
          point:
            row.location_lat != null && row.location_lon != null
              ? { lat: row.location_lat, lon: row.location_lon }
              : undefined,
        }
      : undefined
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
    description: row.description ?? undefined,
    address: row.address ?? undefined,
    location,
    linkedAccount: row.linked_account_url
      ? {
          tunnelUrl: row.linked_account_url,
          status: (row.linked_account_status as 'pending' | 'accepted' | 'revoked') ?? 'pending',
          lastSyncedAt: row.linked_account_synced_at ?? undefined,
        }
      : undefined,
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
    `INSERT INTO contacts (id, name, phone_number, phone_country, phone_label, email_address, email_label, notes, description, address, location_text, location_lat, location_lon, linked_account_url, linked_account_status, linked_account_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    contact.id,
    contact.name,
    contact.phone?.number ?? null,
    contact.phone?.countryCode ?? null,
    contact.phone?.label ?? null,
    contact.email?.address ?? null,
    contact.email?.label ?? null,
    contact.notes ?? null,
    contact.description ?? null,
    contact.address ?? null,
    contact.location?.text ?? null,
    contact.location?.point?.lat ?? null,
    contact.location?.point?.lon ?? null,
    contact.linkedAccount?.tunnelUrl ?? null,
    contact.linkedAccount?.status ?? null,
    contact.linkedAccount?.lastSyncedAt ?? null,
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
  const description = patch.description !== undefined ? patch.description : existing.description
  const address = patch.address !== undefined ? patch.address : existing.address
  const location = patch.location !== undefined ? patch.location : existing.location
  const linkedAccount = patch.linkedAccount !== undefined ? patch.linkedAccount : existing.linkedAccount

  db.prepare(
    `UPDATE contacts SET name=?, phone_number=?, phone_country=?, phone_label=?, email_address=?, email_label=?, notes=?, description=?, address=?, location_text=?, location_lat=?, location_lon=?, linked_account_url=?, linked_account_status=?, linked_account_synced_at=? WHERE id=?`,
  ).run(
    name,
    phone?.number ?? null,
    phone?.countryCode ?? null,
    phone?.label ?? null,
    email?.address ?? null,
    email?.label ?? null,
    notes ?? null,
    description ?? null,
    address ?? null,
    location?.text ?? null,
    location?.point?.lat ?? null,
    location?.point?.lon ?? null,
    linkedAccount?.tunnelUrl ?? null,
    linkedAccount?.status ?? null,
    linkedAccount?.lastSyncedAt ?? null,
    id,
  )
  return getContact(db, id)
}

export function deleteContact(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id)
  return result.changes > 0
}

// ── Prepared messages ───────────────────────────────────────────────────────

interface PreparedRow {
  id: string
  contact_id: string
  body: string
  updated_at: string
}

function rowToPrepared(row: PreparedRow): YPreparedMessage {
  return { id: row.id, contactId: row.contact_id, body: row.body, updatedAt: row.updated_at }
}

export function getPreparedMessages(db: Database, contactId?: string): YPreparedMessage[] {
  if (contactId) {
    const rows = db
      .prepare<[string], PreparedRow>(`SELECT * FROM prepared_messages WHERE contact_id = ?`)
      .all(contactId)
    return rows.map(rowToPrepared)
  }
  const rows = db.prepare<[], PreparedRow>(`SELECT * FROM prepared_messages`).all()
  return rows.map(rowToPrepared)
}

export function getPreparedMessage(db: Database, id: string): YPreparedMessage | undefined {
  const row = db.prepare<[string], PreparedRow>(`SELECT * FROM prepared_messages WHERE id = ?`).get(id)
  return row ? rowToPrepared(row) : undefined
}

export function upsertPreparedMessage(db: Database, msg: YPreparedMessage): YPreparedMessage {
  db.prepare(
    `INSERT INTO prepared_messages (id, contact_id, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`,
  ).run(msg.id, msg.contactId, msg.body, msg.updatedAt)
  return getPreparedMessage(db, msg.id)!
}

export function deletePreparedMessage(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM prepared_messages WHERE id = ?`).run(id)
  return result.changes > 0
}

// ── Trust groups ────────────────────────────────────────────────────────────

interface TrustGroupRow {
  id: string
  name: string
  created_at: string
  updated_at: string | null
}

function rowToTrustGroup(db: Database, row: TrustGroupRow): TrustGroup {
  const members = db
    .prepare<[string], { email: string }>(`SELECT email FROM trust_group_members WHERE trust_group_id = ?`)
    .all(row.id)
  return {
    id: row.id,
    name: row.name,
    memberEmails: members.map((m) => m.email),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

export function getTrustGroups(db: Database): TrustGroup[] {
  const rows = db.prepare<[], TrustGroupRow>(`SELECT * FROM trust_groups ORDER BY name`).all()
  return rows.map((r) => rowToTrustGroup(db, r))
}

export function createTrustGroup(db: Database, group: TrustGroup): TrustGroup {
  db.prepare(`INSERT INTO trust_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    group.id,
    group.name,
    group.createdAt,
    group.updatedAt ?? null,
  )
  const insertMember = db.prepare(`INSERT INTO trust_group_members (trust_group_id, email) VALUES (?, ?)`)
  for (const email of group.memberEmails) insertMember.run(group.id, email)
  return rowToTrustGroup(db, db.prepare<[string], TrustGroupRow>(`SELECT * FROM trust_groups WHERE id = ?`).get(group.id)!)
}

export function updateTrustGroup(db: Database, id: string, patch: Partial<Omit<TrustGroup, 'id' | 'createdAt'>>): TrustGroup | undefined {
  const row = db.prepare<[string], TrustGroupRow>(`SELECT * FROM trust_groups WHERE id = ?`).get(id)
  if (!row) return undefined
  const name = patch.name ?? row.name
  const updatedAt = patch.updatedAt ?? new Date().toISOString()
  db.prepare(`UPDATE trust_groups SET name=?, updated_at=? WHERE id=?`).run(name, updatedAt, id)
  if (patch.memberEmails) {
    db.prepare(`DELETE FROM trust_group_members WHERE trust_group_id = ?`).run(id)
    const insertMember = db.prepare(`INSERT INTO trust_group_members (trust_group_id, email) VALUES (?, ?)`)
    for (const email of patch.memberEmails) insertMember.run(id, email)
  }
  return rowToTrustGroup(db, db.prepare<[string], TrustGroupRow>(`SELECT * FROM trust_groups WHERE id = ?`).get(id)!)
}

export function deleteTrustGroup(db: Database, id: string): boolean {
  db.prepare(`DELETE FROM trust_group_members WHERE trust_group_id = ?`).run(id)
  const result = db.prepare(`DELETE FROM trust_groups WHERE id = ?`).run(id)
  return result.changes > 0
}

// ── My own published locations (YContactLocation) ──────────────────────────

interface ContactLocationRow {
  id: string
  label: string | null
  lat: number
  lon: number
  address: string | null
  start_at: string
  end_at: string | null
  visibility: string
  trust_group_id: string | null
  created_at: string
  updated_at: string | null
}

function rowToContactLocation(row: ContactLocationRow): YContactLocation {
  return {
    id: row.id,
    label: row.label ?? undefined,
    point: { lat: row.lat, lon: row.lon },
    address: row.address ?? undefined,
    startAt: { iso: row.start_at, timezone: 'UTC' },
    endAt: row.end_at ? { iso: row.end_at, timezone: 'UTC' } : undefined,
    visibility: row.visibility as YVisibility,
    trustGroupId: row.trust_group_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

export function getContactLocations(db: Database): YContactLocation[] {
  const rows = db.prepare<[], ContactLocationRow>(`SELECT * FROM contact_locations ORDER BY start_at DESC`).all()
  return rows.map(rowToContactLocation)
}

export function createContactLocation(db: Database, loc: YContactLocation): YContactLocation {
  db.prepare(
    `INSERT INTO contact_locations (id, label, lat, lon, address, start_at, end_at, visibility, trust_group_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    loc.id,
    loc.label ?? null,
    loc.point.lat,
    loc.point.lon,
    loc.address ?? null,
    loc.startAt.iso,
    loc.endAt?.iso ?? null,
    loc.visibility,
    loc.trustGroupId ?? null,
    loc.createdAt,
    loc.updatedAt ?? null,
  )
  return getContactLocations(db).find((l) => l.id === loc.id)!
}

export function updateContactLocation(
  db: Database,
  id: string,
  patch: Partial<Omit<YContactLocation, 'id' | 'createdAt'>>,
): YContactLocation | undefined {
  const existing = getContactLocations(db).find((l) => l.id === id)
  if (!existing) return undefined
  const next: YContactLocation = { ...existing, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() }
  db.prepare(
    `UPDATE contact_locations SET label=?, lat=?, lon=?, address=?, start_at=?, end_at=?, visibility=?, trust_group_id=?, updated_at=? WHERE id=?`,
  ).run(
    next.label ?? null,
    next.point.lat,
    next.point.lon,
    next.address ?? null,
    next.startAt.iso,
    next.endAt?.iso ?? null,
    next.visibility,
    next.trustGroupId ?? null,
    next.updatedAt ?? null,
    id,
  )
  return next
}

export function deleteContactLocation(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM contact_locations WHERE id = ?`).run(id)
  return result.changes > 0
}
