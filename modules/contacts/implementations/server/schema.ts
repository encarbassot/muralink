import type { Database } from 'better-sqlite3'

export const schema = `
CREATE TABLE IF NOT EXISTS contacts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  phone_number      TEXT,
  phone_country     TEXT,
  phone_label       TEXT,
  email_address     TEXT,
  email_label       TEXT,
  notes             TEXT,
  description       TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);

CREATE TABLE IF NOT EXISTS prepared_messages (
  id          TEXT PRIMARY KEY,
  contact_id  TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prepared_contact ON prepared_messages (contact_id);

-- Trust groups + my own published locations (@muralink/types' YVisibility/canView
-- primitive). Both are owned by MY account, gating what a linked contact's
-- request (identified by their email, via a scoped token) may read back.
CREATE TABLE IF NOT EXISTS trust_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS trust_group_members (
  trust_group_id  TEXT NOT NULL,
  email           TEXT NOT NULL,
  PRIMARY KEY (trust_group_id, email)
);

CREATE TABLE IF NOT EXISTS contact_locations (
  id               TEXT PRIMARY KEY,
  label            TEXT,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL,
  address          TEXT,
  start_at         TEXT NOT NULL,
  end_at           TEXT,
  visibility       TEXT NOT NULL,
  trust_group_id   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT
);
`

// SQLite has no ADD COLUMN IF NOT EXISTS, so databases created before
// `description` are patched by inspecting the live table (calendar pattern).
export function migrateContacts(db: Database): void {
  const cols = (db.prepare(`PRAGMA table_info(contacts)`).all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!cols.includes('description')) db.exec(`ALTER TABLE contacts ADD COLUMN description TEXT`)
  if (!cols.includes('address')) db.exec(`ALTER TABLE contacts ADD COLUMN address TEXT`)
  if (!cols.includes('location_text')) db.exec(`ALTER TABLE contacts ADD COLUMN location_text TEXT`)
  if (!cols.includes('location_lat')) db.exec(`ALTER TABLE contacts ADD COLUMN location_lat REAL`)
  if (!cols.includes('location_lon')) db.exec(`ALTER TABLE contacts ADD COLUMN location_lon REAL`)
  if (!cols.includes('linked_account_url')) db.exec(`ALTER TABLE contacts ADD COLUMN linked_account_url TEXT`)
  if (!cols.includes('linked_account_status')) db.exec(`ALTER TABLE contacts ADD COLUMN linked_account_status TEXT`)
  if (!cols.includes('linked_account_synced_at')) db.exec(`ALTER TABLE contacts ADD COLUMN linked_account_synced_at TEXT`)
}
