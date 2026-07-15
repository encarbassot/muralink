// Primitive types — the interoperability atoms.
// Zero dependencies. No React, no Express, no logic beyond pure validators.
// Every module imports from here. These are the contract that lets a contact's
// website be the same `YUrl` a password's site is, the same url module renders.

/** A web address that knows its parts. */
export interface YUrl {
  raw: string // exactly what the user typed
  normalized: string // canonical form (lowercased host, resolved)
  domain: string // bare host, e.g. "example.com"
}

/** An email address with an optional human label ("work", "home"). */
export interface YEmail {
  address: string
  label?: string
}

/** A phone number kept split so it never decays to an ambiguous string. */
export interface YPhone {
  number: string
  countryCode: string
  label?: string
}

/** Money as integer-safe amount + currency. `precision` = decimal places. */
export interface YMoney {
  amount: number
  currency: string
  precision: number
}

/** A moment in time, always carrying its timezone. */
export interface YDateTime {
  iso: string
  timezone: string
}

/** A span of time. Seconds is the canonical unit. */
export interface YDuration {
  seconds: number
}

/** A stored credential. Never the plaintext — only the hash + hints. */
export interface YPassword {
  hash: string
  hint?: string
  url?: YUrl
}

/** An active NAS file-server session registered with the Tunnel handshake. */
export interface HostSession {
  sessionId: string     // assigned by Tunnel on registration
  ownerId: string       // elio account id
  hostIp: string        // public IP of the serving machine
  port: number          // port the file server is listening on
  shareToken: string    // UUID shared with peers to authorize connection
  pathLabel: string     // human label, e.g. "My Documents"
  registeredAt: string  // ISO date
  expiresAt?: string    // ISO date — optional TTL
}

// ── Pure validators ─────────────────────────────────────────────────────────
// No network, no framework, no side effects. Safe in any environment.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when the string is a structurally valid URL. */
export function isValidUrl(raw: string): boolean {
  try {
    new URL(raw)
    return true
  } catch {
    return false
  }
}

/** True when the email address is structurally valid. */
export function isValidEmail(address: string): boolean {
  return emailPattern.test(address)
}

/** True when money is internally consistent (non-negative precision, finite amount). */
export function isValidMoney(money: YMoney): boolean {
  return (
    Number.isFinite(money.amount) &&
    Number.isInteger(money.precision) &&
    money.precision >= 0 &&
    money.currency.length > 0
  )
}
