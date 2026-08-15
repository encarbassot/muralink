// Verifier for a CLIENT's own login token — the credential their backend
// (Rails/Devise, an internal SSO, whatever) already issues when one of their
// employees logs in. Mural never emits its own password credential for these
// users: it trusts the client's proof of identity and mints its OWN session
// on top (see users.ts' upsertFederated + server.ts' POST /auth/federated).
// Same spirit as platforms/server/src/entitlement/index.ts verifying with a
// pinned/fetched public key — self-contained (node:crypto + fetch only) and
// defensive: any malformed input, untrusted issuer, or bad signature returns
// null, never throws. Callers treat null as "not authenticated".

import { createPublicKey, verify, type KeyObject } from 'node:crypto'

export interface ClientTokenConfig {
  /** JWKS endpoint the client's auth backend publishes (e.g. Devise/OIDC-style
   *  `/.well-known/jwks.json`). Fetched and cached per `kid`. */
  jwksUrl?: string
  /** A single pinned public key (PEM), for a client that hands you one key
   *  directly instead of a JWKS endpoint — the auditable, no-network path. */
  publicKey?: string
  /** Required `iss` claim — reject tokens from anywhere else. */
  issuer: string
}

/** The identity Mural cares about, once the token is verified. `externalId`
 *  (the `sub` claim) is what upsertFederated() keys the local user on. */
export interface FederatedIdentity {
  externalId: string
  email?: string
  name?: string
}

interface JwtHeader {
  alg?: string
  kid?: string
}

interface JwtClaims {
  iss?: string
  sub?: string
  email?: string
  name?: string
  exp?: number
  [key: string]: unknown
}

// Small tolerance for clock skew between Mural's host and the client's.
const LEEWAY_MS = 60_000

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

// alg → the (algorithm, dsaEncoding) pair node:crypto's verify() expects.
// Unlisted algs (notably 'none' and HMAC algs like HS256, which would let
// anyone forge a token with no server-side secret check here) fail closed.
const ALG_TO_NODE: Record<string, { algorithm: string | null; dsaEncoding?: 'ieee-p1363' }> = {
  RS256: { algorithm: 'RSA-SHA256' },
  RS384: { algorithm: 'RSA-SHA384' },
  RS512: { algorithm: 'RSA-SHA512' },
  ES256: { algorithm: 'SHA256', dsaEncoding: 'ieee-p1363' },
  ES384: { algorithm: 'SHA384', dsaEncoding: 'ieee-p1363' },
  EdDSA: { algorithm: null },
}

// Tiny per-process JWKS cache, keyed by URL. A client's JWKS rotates rarely;
// re-fetching on every request would be a needless network dependency on the
// hot auth path.
const jwksCache = new Map<string, { fetchedAt: number; keys: Map<string, KeyObject> }>()
const JWKS_TTL_MS = 10 * 60_000

async function fetchJwks(url: string): Promise<Map<string, KeyObject>> {
  const cached = jwksCache.get(url)
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys

  const res = await fetch(url)
  if (!res.ok) throw new Error(`jwks fetch ${res.status}`)
  const body = (await res.json()) as { keys?: Array<Record<string, unknown>> }
  const keys = new Map<string, KeyObject>()
  for (const jwk of body.keys ?? []) {
    const kid = typeof jwk['kid'] === 'string' ? jwk['kid'] : undefined
    if (!kid) continue
    try {
      keys.set(kid, createPublicKey({ key: jwk as unknown as Record<string, string>, format: 'jwk' }))
    } catch {
      // A key this process can't parse (unsupported kty) is skipped, not fatal.
    }
  }
  jwksCache.set(url, { fetchedAt: Date.now(), keys })
  return keys
}

async function resolveKey(cfg: ClientTokenConfig, kid: string | undefined): Promise<KeyObject | null> {
  if (cfg.publicKey) return createPublicKey(cfg.publicKey)
  if (cfg.jwksUrl) {
    const keys = await fetchJwks(cfg.jwksUrl)
    if (!kid) return null
    return keys.get(kid) ?? null
  }
  return null
}

/** Verify a compact JWS token issued by the client's own auth backend.
 *  Returns the identity on success, or null on any failure (bad shape,
 *  unsupported/missing alg, wrong issuer, bad signature, expired). */
export async function verifyClientToken(
  cfg: ClientTokenConfig,
  token: string,
): Promise<FederatedIdentity | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [h, p, sig] = parts as [string, string, string]

    const header = JSON.parse(b64urlToBuf(h).toString('utf-8')) as JwtHeader
    const algSpec = header.alg ? ALG_TO_NODE[header.alg] : undefined
    if (!algSpec) return null

    const key = await resolveKey(cfg, header.kid)
    if (!key) return null

    const signingInput = Buffer.from(`${h}.${p}`)
    const verifyKey = algSpec.dsaEncoding ? { key, dsaEncoding: algSpec.dsaEncoding } : key
    const ok = verify(algSpec.algorithm, signingInput, verifyKey, b64urlToBuf(sig))
    if (!ok) return null

    const claims = JSON.parse(b64urlToBuf(p).toString('utf-8')) as JwtClaims
    if (claims.iss !== cfg.issuer) return null
    if (!claims.sub) return null
    if (typeof claims.exp === 'number' && Date.now() > claims.exp * 1000 + LEEWAY_MS) return null

    return { externalId: claims.sub, email: claims.email, name: claims.name }
  } catch {
    return null
  }
}
