// Vault persistence. Every function here moves opaque ciphertext around; none
// of them can inspect it.

import type { Database } from 'better-sqlite3'
import type { YVaultMeta, YVaultRecord } from '../../types.ts'

interface EntryRow {
  id: string
  ciphertext: string
  iv: string
  updated_at: string
}

function toRecord(row: EntryRow): YVaultRecord {
  return {
    id: row.id,
    blob: { ciphertext: row.ciphertext, iv: row.iv },
    updatedAt: row.updated_at,
  }
}

export function getVaultRecords(db: Database): YVaultRecord[] {
  const rows = db
    .prepare('SELECT id, ciphertext, iv, updated_at FROM vault_entries ORDER BY updated_at DESC')
    .all() as EntryRow[]
  return rows.map(toRecord)
}

export function getVaultRecord(db: Database, id: string): YVaultRecord | null {
  const row = db
    .prepare('SELECT id, ciphertext, iv, updated_at FROM vault_entries WHERE id = ?')
    .get(id) as EntryRow | undefined
  return row ? toRecord(row) : null
}

export function createVaultRecord(db: Database, record: YVaultRecord): YVaultRecord {
  const updatedAt = record.updatedAt ?? new Date().toISOString()
  db.prepare(
    'INSERT INTO vault_entries (id, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?)',
  ).run(record.id, record.blob.ciphertext, record.blob.iv, updatedAt)
  return { ...record, updatedAt }
}

// A vault edit always replaces the whole ciphertext — there are no partial
// updates, because every field lives inside the one encrypted payload.
export function updateVaultRecord(
  db: Database,
  id: string,
  patch: { blob?: YVaultRecord['blob']; updatedAt?: string },
): YVaultRecord | null {
  const existing = getVaultRecord(db, id)
  if (!existing) return null
  const blob = patch.blob ?? existing.blob
  const updatedAt = patch.updatedAt ?? new Date().toISOString()
  db.prepare('UPDATE vault_entries SET ciphertext = ?, iv = ?, updated_at = ? WHERE id = ?')
    .run(blob.ciphertext, blob.iv, updatedAt, id)
  return { id, blob, updatedAt }
}

export function deleteVaultRecord(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM vault_entries WHERE id = ?').run(id).changes > 0
}

export function getVaultMeta(db: Database): YVaultMeta | null {
  const row = db
    .prepare('SELECT salt, verifier_ciphertext, verifier_iv, updated_at FROM vault_meta WHERE id = 1')
    .get() as { salt: string; verifier_ciphertext: string; verifier_iv: string; updated_at: string } | undefined
  if (!row) return null
  return {
    salt: row.salt,
    verifier: { ciphertext: row.verifier_ciphertext, iv: row.verifier_iv },
    updatedAt: row.updated_at,
  }
}

// Upsert. Replacing the meta re-keys the vault, so the caller is expected to
// have re-encrypted every entry first — the routes refuse to do it while
// entries exist precisely because a silent re-key strands every one of them.
export function putVaultMeta(db: Database, meta: YVaultMeta): YVaultMeta {
  const updatedAt = meta.updatedAt ?? new Date().toISOString()
  db.prepare(
    `INSERT INTO vault_meta (id, salt, verifier_ciphertext, verifier_iv, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       salt = excluded.salt,
       verifier_ciphertext = excluded.verifier_ciphertext,
       verifier_iv = excluded.verifier_iv,
       updated_at = excluded.updated_at`,
  ).run(meta.salt, meta.verifier.ciphertext, meta.verifier.iv, updatedAt)
  return { ...meta, updatedAt }
}

export function countVaultRecords(db: Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM vault_entries').get() as { n: number }).n
}
