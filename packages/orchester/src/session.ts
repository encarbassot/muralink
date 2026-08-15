// The instance login gate.
//
// Replaces HTTP basic auth: nginx asks this module (through auth_request)
// whether a request carries a valid session, and serves a login page instead
// of a browser credential dialog when it does not.
//
// Why not basic auth: the browser dialog cannot be styled, cannot be logged
// out of, and on several browsers cannot be retried after a typo without
// clearing site data. The credential also travels on every single request.
// A signed cookie is sent once, expires, and can be revoked.
//
// No dependencies. scrypt and hmac come from node:crypto, and the cookie is
// verified with a timing-safe comparison.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'mural_session'

// scrypt parameters. N=2^15 costs ~100ms on the kind of hardware a self-hoster
// uses, which is the point: a stolen hash must stay expensive to attack.
const SCRYPT_N = 32_768
const SCRYPT_KEYLEN = 32
// N=2^15 with r=8 needs 128 * N * r = 32 MiB, which is exactly Node's default
// maxmem — and "exactly" throws. State the budget instead of trusting a default
// that would make every login fail at runtime.
const SCRYPT_OPTS = { N: SCRYPT_N, maxmem: 64 * 1024 * 1024 } as const

export interface SessionConfig {
  // Who may log in. One account: this is a single-user instance.
  user: string
  // `scrypt$<saltHex>$<hashHex>` — never the password itself.
  passwordHash: string
  // Signs the cookie. Rotating it logs everyone out, which is the intended
  // emergency exit.
  secret: string
  // Session lifetime. Long by default: this is someone's own machine, and a
  // gate that logs you out daily gets replaced by no gate at all.
  maxAgeSeconds?: number
}

const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

// ── password hashing ─────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  let expected: Buffer
  try {
    expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_OPTS)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ── session tokens ───────────────────────────────────────────────────────────

// `<user>.<expiresAt>.<hmac>`. Stateless on purpose: an instance that reboots
// mid-session should not log its owner out, and there is no session store to
// keep consistent.
export function mintSession(cfg: SessionConfig): string {
  const expires = Date.now() + (cfg.maxAgeSeconds ?? DEFAULT_MAX_AGE) * 1000
  const payload = `${Buffer.from(cfg.user).toString('base64url')}.${expires}`
  return `${payload}.${sign(payload, cfg.secret)}`
}

export function verifySession(token: string | undefined, cfg: SessionConfig): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [userPart, expiresPart, mac] = parts as [string, string, string]

  const expected = sign(`${userPart}.${expiresPart}`, cfg.secret)
  // Compare the signature before trusting any other field.
  if (!safeEqual(mac, expected)) return false

  const expires = Number(expiresPart)
  if (!Number.isFinite(expires) || Date.now() > expires) return false

  return Buffer.from(userPart, 'base64url').toString() === cfg.user
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// ── cookies ──────────────────────────────────────────────────────────────────

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

export function sessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds?: number }): string {
  const age = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE
  // HttpOnly: no script on the page can read it, so an XSS in a module cannot
  // exfiltrate the session. SameSite=Lax keeps it off cross-site requests while
  // still surviving a normal link into the instance.
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${age}`]
  if (opts.secure) flags.push('Secure')
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags.join('; ')}`
}

export function clearedCookie(opts: { secure: boolean }): string {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (opts.secure) flags.push('Secure')
  return `${SESSION_COOKIE}=; ${flags.join('; ')}`
}

// ── config from the environment ──────────────────────────────────────────────

// The deploy wizard writes these into the systemd environment file. All three
// must be present: a half-configured gate is no gate, and silently serving an
// instance wide open is the one outcome this must never produce.
export function sessionFromEnv(env: NodeJS.ProcessEnv = process.env): SessionConfig | null {
  const user = env['MURALINK_AUTH_USER']
  const passwordHash = env['MURALINK_AUTH_HASH']
  const secret = env['MURALINK_SESSION_SECRET']
  if (!user || !passwordHash || !secret) return null
  return { user, passwordHash, secret }
}
