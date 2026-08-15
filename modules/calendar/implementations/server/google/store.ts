// Persistence for the Google sync: the OAuth account (single-user core → one
// row), the per-calendar incremental syncToken, and an OUTBOX of local writes
// waiting to be mirrored to Google. Event↔Google id mapping lives on the
// events table (google_id / google_etag columns, added by migrateCalendar).
//
// Loop safety: ONLY user-origin writes (via the HTTP routes' hooks) enqueue an
// outbox row. Writes applied by a pull go straight through queries.* and never
// touch the outbox, so a pulled change is never echoed back to Google.

import type { Database } from 'better-sqlite3'
import type { YCalendarEvent } from '../../../types.ts'
import { rowToEvent, type EventRow } from '../queries.ts'

export interface GoogleAccount {
  accessToken: string
  refreshToken: string
  expiryMs: number // epoch ms when the access token expires
  scope: string
  email?: string
}

export type OutboxOp = 'upsert' | 'delete'

export interface OutboxRow {
  seq: number
  op: OutboxOp
  eventId: string
  googleId: string | null // set for deletes (the row is gone by drain time)
}

export function initGoogleSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_account (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_ms     INTEGER NOT NULL,
      scope         TEXT NOT NULL,
      email         TEXT
    );
    CREATE TABLE IF NOT EXISTS google_sync_state (
      calendar_id TEXT PRIMARY KEY,
      sync_token  TEXT,
      updated_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS google_outbox (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      op         TEXT NOT NULL,
      event_id   TEXT NOT NULL,
      google_id  TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_google ON events (google_id);
  `)
}

// ── Account ─────────────────────────────────────────────────────────────────

export function getAccount(db: Database): GoogleAccount | undefined {
  const row = db.prepare(`SELECT * FROM google_account WHERE id = 1`).get() as
    | { access_token: string; refresh_token: string; expiry_ms: number; scope: string; email: string | null }
    | undefined
  if (!row) return undefined
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiryMs: row.expiry_ms,
    scope: row.scope,
    email: row.email ?? undefined,
  }
}

export function isConnected(db: Database): boolean {
  return getAccount(db) !== undefined
}

export function saveAccount(db: Database, acc: GoogleAccount): void {
  db.prepare(
    `INSERT INTO google_account (id, access_token, refresh_token, expiry_ms, scope, email)
     VALUES (1, @accessToken, @refreshToken, @expiryMs, @scope, @email)
     ON CONFLICT(id) DO UPDATE SET
       access_token=@accessToken, refresh_token=@refreshToken,
       expiry_ms=@expiryMs, scope=@scope, email=@email`,
  ).run({ ...acc, email: acc.email ?? null })
}

// Refresh responses omit refresh_token — keep the stored one.
export function patchAccountTokens(
  db: Database,
  patch: { accessToken: string; expiryMs: number },
): void {
  db.prepare(`UPDATE google_account SET access_token=@accessToken, expiry_ms=@expiryMs WHERE id=1`).run(patch)
}

export function clearAccount(db: Database): void {
  db.exec(
    `DELETE FROM google_account; DELETE FROM google_sync_state; DELETE FROM google_outbox;
     UPDATE events SET google_id=NULL, google_etag=NULL;`,
  )
}

// ── Sync token ──────────────────────────────────────────────────────────────

export function getSyncToken(db: Database, calendarId: string): string | undefined {
  const row = db
    .prepare(`SELECT sync_token FROM google_sync_state WHERE calendar_id = ?`)
    .get(calendarId) as { sync_token: string | null } | undefined
  return row?.sync_token ?? undefined
}

export function setSyncToken(db: Database, calendarId: string, token: string | null): void {
  db.prepare(
    `INSERT INTO google_sync_state (calendar_id, sync_token, updated_at)
     VALUES (@calendarId, @token, @now)
     ON CONFLICT(calendar_id) DO UPDATE SET sync_token=@token, updated_at=@now`,
  ).run({ calendarId, token, now: new Date().toISOString() })
}

// ── Outbox (local writes pending push to Google) ────────────────────────────

export function enqueueOutbox(db: Database, op: OutboxOp, eventId: string, googleId: string | null): void {
  db.prepare(
    `INSERT INTO google_outbox (op, event_id, google_id, created_at) VALUES (?, ?, ?, ?)`,
  ).run(op, eventId, googleId, new Date().toISOString())
}

export function listOutbox(db: Database): OutboxRow[] {
  return (
    db.prepare(`SELECT seq, op, event_id, google_id FROM google_outbox ORDER BY seq`).all() as {
      seq: number
      op: OutboxOp
      event_id: string
      google_id: string | null
    }[]
  ).map((r) => ({ seq: r.seq, op: r.op, eventId: r.event_id, googleId: r.google_id }))
}

export function removeOutbox(db: Database, seq: number): void {
  db.prepare(`DELETE FROM google_outbox WHERE seq = ?`).run(seq)
}

// ── Event ↔ Google mapping ──────────────────────────────────────────────────

export function findEventByGoogleId(db: Database, googleId: string): YCalendarEvent | undefined {
  const row = db.prepare(`SELECT * FROM events WHERE google_id = ?`).get(googleId) as EventRow | undefined
  return row ? rowToEvent(row) : undefined
}

export function setEventGoogle(
  db: Database,
  eventId: string,
  googleId: string | null,
  etag: string | null,
): void {
  db.prepare(`UPDATE events SET google_id = ?, google_etag = ? WHERE id = ?`).run(googleId, etag, eventId)
}
