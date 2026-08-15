// Entitlement — the signed proof of what a paid capability (multi-user, extra
// features) is authorized for. The open-source core VERIFIES here; only our
// master API holds the private key that can SIGN one (see muralink-cloud
// services/master-api/src/entitlement/sign.ts). This file is deliberately
// self-contained (node:crypto + node:fs only) so the public core builds without
// any cloud code.
//
// It is NOT a lock on the code — the code is open and yours to run and edit. It
// is the credential the paid SERVICE recognises. The value we sell is coordinat-
// ion (letting many authenticated users share one workspace, and authorizing
// each `who` against the account's seats at cloud-sync time — that authorization
// is server-side and structural, not something a local fork can grant itself).
// This token is how the instance proves, offline and locally, which coordinated
// capabilities its account has paid for.
//
// Why bundled-and-pinned public keys, not a fetched key: verification must work
// fully offline (local-first), and a key fetched from a URL could be swapped by
// anyone controlling that URL. A checked-in constant is auditable — you can read
// exactly what your instance trusts.
//
// Offline grace: `exp` IS the hard cutoff (== graceUntil). An instance offline
// for less than the grace window keeps its cached token valid. `staleAfter` is a
// soft hint the orchester uses to try a refresh; missing it is not fatal.
// SINGLE-USER FEATURES NEVER CONSULT THIS — an inert/invalid entitlement only
// withholds paid capabilities, it never blocks the free local-first core.

import { verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Plan = 'core' | 'user' | 'family' | 'enterprise'

// The claims carried inside a signed token (JWS payload).
export interface EntitlementClaims {
  iss: string
  aud: string
  sub: string // account / instance id
  ver: number
  plan: Plan
  multiuser: boolean
  seats: number
  features: string[]
  iat: number // seconds
  staleAfter: number // seconds — soft: try to refresh past this
  exp: number // seconds — hard: == graceUntil
  jti: string
}

// The resolved runtime view the rest of the core reads.
export interface Entitlement {
  plan: Plan
  multiuser: boolean
  seats: number
  features: string[]
  sub: string
  staleAfter: number
  exp: number
}

// The default when nothing valid is present: the free, single-user core. No
// paid capability, never expires (it grants nothing to expire).
export const INERT: Entitlement = {
  plan: 'core',
  multiuser: false,
  seats: 1,
  features: [],
  sub: '',
  staleAfter: 0,
  exp: 0,
}

// Pinned issuer public keys, keyed by `kid`. Rotation = add a new entry and
// start signing with its kid; old tokens keep verifying until they expire.
//
// PROD: replace/append your production key and restrict trust via
// ELIO_ENTITLEMENT_KIDS so a leaked dev key can't forge prod tokens. The 'dev-1'
// key below is a development keypair whose private half ships as the master API
// dev fallback — fine for local dev, never for production trust.
export const PUBLIC_KEYS: Record<string, string> = {
  'dev-1': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA71wXkh6I0ELnFqwjCwfDembHSy/ADhZbpup4UOeNRUM=
-----END PUBLIC KEY-----
`,
}

// Which kids this core trusts. Default: every bundled key. Prod pins a subset.
const TRUSTED_KIDS: ReadonlySet<string> = new Set(
  (process.env['ELIO_ENTITLEMENT_KIDS'] ?? Object.keys(PUBLIC_KEYS).join(','))
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
)

// Small tolerance for clock skew on offline devices.
const LEEWAY_MS = 60_000

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

// Verify a compact JWS entitlement token. Returns the claims on success, or null
// on any failure (bad shape, untrusted kid, bad signature, expired past grace).
// Never throws — callers treat null as "inert".
export function verifyEntitlementToken(token: string): EntitlementClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [h, p, sig] = parts as [string, string, string]

    const header = JSON.parse(b64urlToBuf(h).toString('utf-8')) as { alg?: string; kid?: string }
    if (header.alg !== 'EdDSA') return null
    const kid = header.kid ?? ''
    if (!TRUSTED_KIDS.has(kid)) return null
    const pubPem = PUBLIC_KEYS[kid]
    if (!pubPem) return null

    // Verify over the literal `header.payload` bytes from the token — never a
    // re-serialized copy — so the signer and verifier need not agree on JSON
    // formatting, only on the byte string that was signed.
    const signingInput = Buffer.from(`${h}.${p}`)
    const ok = verify(null, signingInput, pubPem, b64urlToBuf(sig))
    if (!ok) return null

    const claims = JSON.parse(b64urlToBuf(p).toString('utf-8')) as EntitlementClaims
    if (typeof claims.exp !== 'number') return null
    if (Date.now() > claims.exp * 1000 + LEEWAY_MS) return null // past hard grace cutoff

    return claims
  } catch {
    return null
  }
}

function claimsToEntitlement(c: EntitlementClaims): Entitlement {
  return {
    plan: c.plan,
    multiuser: c.multiuser === true,
    seats: Number.isFinite(c.seats) ? c.seats : 1,
    features: Array.isArray(c.features) ? c.features : [],
    sub: c.sub,
    staleAfter: c.staleAfter,
    exp: c.exp,
  }
}

// Where a self-hosted orchester caches its fetched token. Honours ELIO_HOME so a
// headless server and a desktop instance share one home. Overridable directly
// with ELIO_ENTITLEMENT_FILE.
function cacheFilePath(): string {
  if (process.env['ELIO_ENTITLEMENT_FILE']) return process.env['ELIO_ENTITLEMENT_FILE'] as string
  const home = process.env['ELIO_HOME'] ?? join(homedir(), '.elio')
  return join(home, 'entitlement.json')
}

// Resolve the raw token string: env (cloud-provisioned cores get it injected)
// wins, else the cached file (self-host, written by the account-link layer).
function resolveToken(): string | null {
  const fromEnv = process.env['ELIO_ENTITLEMENT']
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  try {
    const raw = readFileSync(cacheFilePath(), 'utf-8').trim()
    // Accept either a bare token or a { token } wrapper.
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { token?: string }
      return parsed.token?.trim() || null
    }
    return raw || null
  } catch {
    return null
  }
}

let cached: (Entitlement & { valid: boolean }) | null = null

// The core's single question: "what am I entitled to?" Cached per process; the
// token only changes on (re)boot for cloud cores and on refresh for self-host,
// both of which start a fresh process or call clearEntitlementCache().
export function getEntitlement(): Entitlement & { valid: boolean } {
  if (cached) return cached
  const token = resolveToken()
  const claims = token ? verifyEntitlementToken(token) : null
  cached = claims
    ? { ...claimsToEntitlement(claims), valid: true }
    : { ...INERT, valid: false }
  return cached
}

// Drop the memoised value (tests, or after a live refresh writes a new token).
export function clearEntitlementCache(): void {
  cached = null
}
