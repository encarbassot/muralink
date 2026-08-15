// Local user + session store for the enterprise multi-user front. Deliberately
// small: SQLite, scrypt password hashing (zero extra deps — node:crypto only),
// opaque bearer sessions. It exists ONLY to answer "which verified user is this
// request", so the front can stamp the shared core with an authenticated `who`.
// A free/self-host single-user instance never instantiates this.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

export interface MuUser {
  id: string
  email: string
  created_at: string
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export class UserStore {
  private db: Database.Database

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
    `)
    this.migrate()
  }

  // SQLite has no ADD COLUMN IF NOT EXISTS, so a db created before federated
  // login is patched by inspecting the live table (contacts/schema.ts pattern).
  // `external_id` stays nullable — password users never set it — with a
  // PARTIAL unique index so only federated rows are constrained.
  private migrate(): void {
    const cols = (this.db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name)
    if (!cols.includes('external_id')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN external_id TEXT`)
      this.db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id ON users (external_id) WHERE external_id IS NOT NULL`,
      )
    }
  }

  findByEmail(email: string): (MuUser & { password_hash: string }) | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase().trim()) as (MuUser & { password_hash: string }) | undefined
  }

  findByExternalId(externalId: string): MuUser | undefined {
    return this.db.prepare('SELECT id, email, created_at FROM users WHERE external_id = ?').get(externalId) as
      | MuUser
      | undefined
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
  }

  // Create a user. Throws if the email already exists.
  signup(email: string, password: string): MuUser {
    const norm = email.toLowerCase().trim()
    if (this.findByEmail(norm)) throw new Error('email already registered')
    const user: MuUser = { id: randomUUID(), email: norm, created_at: new Date().toISOString() }
    this.db
      .prepare(
        'INSERT INTO users (id, email, password_hash, created_at) VALUES (@id, @email, @ph, @created_at)',
      )
      .run({ id: user.id, email: user.email, ph: hashPassword(password), created_at: user.created_at })
    return user
  }

  // Verify credentials and mint a session token. Returns null on bad login.
  login(email: string, password: string): { token: string; user: MuUser } | null {
    const row = this.findByEmail(email)
    if (!row || !verifyPassword(password, row.password_hash)) return null
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    this.db
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(token, row.id, expiresAt)
    return { token, user: { id: row.id, email: row.email, created_at: row.created_at } }
  }

  // Find-or-create a user for a FEDERATED identity (no password — the
  // client's own auth backend already proved who this is; see
  // verifiers/clientToken.ts) and mint a session exactly like login() does.
  // Keyed on `externalId` (the verified token's `sub`), never on email — a
  // client's staff directory may have no email on file, and email can change
  // without changing identity. A password_hash is still stored (schema
  // unchanged) but is a random value nobody knows; only this route can ever
  // authenticate a federated user.
  upsertFederated(externalId: string, email?: string): { token: string; user: MuUser } {
    let user = this.findByExternalId(externalId)
    if (!user) {
      const emailKey = (email ?? `${externalId}@federated.local`).toLowerCase().trim()
      user = { id: randomUUID(), email: emailKey, created_at: new Date().toISOString() }
      this.db
        .prepare(
          'INSERT INTO users (id, email, password_hash, external_id, created_at) VALUES (@id, @email, @ph, @external_id, @created_at)',
        )
        .run({
          id: user.id,
          email: user.email,
          ph: hashPassword(randomBytes(32).toString('hex')),
          external_id: externalId,
          created_at: user.created_at,
        })
    }
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt)
    return { token, user }
  }

  // Resolve a bearer token to a user id, or null if unknown/expired.
  verifySession(token: string): string | null {
    const row = this.db
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
      .get(token) as { user_id: string; expires_at: string } | undefined
    if (!row) return null
    if (new Date(row.expires_at) < new Date()) {
      this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
      return null
    }
    return row.user_id
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  }
}
