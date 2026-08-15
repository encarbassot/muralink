// Account link — the bridge between an anonymous-first instance and a user's
// account on the mother (Tunnel) API.
//
// Anonymous is the default: with no account.json the instance runs fully offline
// and never dials the Tunnel. Linking is opt-in and only UNLOCKS extra features
// (cross-instance backup lands in Fase 2). Linking does two calls against the
// Tunnel — POST /auth/login (user session) then POST /instances/register (mint
// this instance's own id + key) — and persists the result to ~/.elio/account.json.
//
// From then on the instance authenticates as ITSELF (instanceId + instanceKey)
// over the agent link; the user password is never stored.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { paths, ensureHome } from './paths'
import { TunnelAgent } from './tunnel-agent'

// Pull a fresh signed entitlement from the mother API and cache it for the core
// to verify. Best-effort by design: on any failure we KEEP the existing cached
// token — that is the offline grace in action (the token stays valid until its
// own `exp`). Returns true if a new token was written.
export async function fetchEntitlement(link: AccountLink): Promise<boolean> {
  const base = link.tunnelBaseUrl.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/entitlements/current`, {
      headers: { Authorization: `Bearer ${link.sessionToken}` },
    })
    if (!res.ok) return false
    const body = (await res.json()) as { token?: string }
    if (!body.token) return false
    ensureHome()
    writeFileSync(
      paths.entitlement,
      JSON.stringify({ token: body.token, fetchedAt: new Date().toISOString() }, null, 2),
    )
    return true
  } catch {
    return false // unreachable → keep the cached token (offline grace)
  }
}

export interface AccountLink {
  // e.g. http://localhost:4000 — the mother API base.
  tunnelBaseUrl: string
  email: string
  // User session token from /auth/login. Kept for revoke/logout; NOT the password.
  sessionToken: string
  // This instance's own identity, from /instances/register.
  instanceId: string
  instanceKey: string
  label: string
  linkedAt: string
}

export interface AccountStatus {
  linked: boolean
  email?: string
  instanceId?: string
  tunnelBaseUrl?: string
  online?: boolean
}

export function loadAccount(): AccountLink | null {
  try {
    return JSON.parse(readFileSync(paths.account, 'utf-8')) as AccountLink
  } catch {
    return null // absence = anonymous
  }
}

export function saveAccount(link: AccountLink): void {
  ensureHome()
  writeFileSync(paths.account, JSON.stringify(link, null, 2))
}

export function clearAccount(): void {
  try {
    unlinkSync(paths.account)
  } catch {
    // already anonymous
  }
  try {
    unlinkSync(paths.entitlement)
  } catch {
    // no cached entitlement — fine
  }
}

export interface LinkParams {
  tunnelBaseUrl: string
  email: string
  password: string
  label: string
}

// Log in to the mother API and register THIS instance, then persist the link.
// Throws on bad credentials or unreachable Tunnel — the caller surfaces it.
export async function linkAccount(params: LinkParams): Promise<AccountLink> {
  const base = params.tunnelBaseUrl.replace(/\/$/, '')

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: params.email, password: params.password }),
  })
  if (!loginRes.ok) {
    throw new Error(`login failed: ${loginRes.status} ${await safeText(loginRes)}`)
  }
  const { token: sessionToken } = (await loginRes.json()) as { token: string }

  const regRes = await fetch(`${base}/instances/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ label: params.label }),
  })
  if (!regRes.ok) {
    throw new Error(`register failed: ${regRes.status} ${await safeText(regRes)}`)
  }
  const reg = (await regRes.json()) as { id: string; apiKey: string }

  const link: AccountLink = {
    tunnelBaseUrl: base,
    email: params.email,
    sessionToken,
    instanceId: reg.id,
    instanceKey: reg.apiKey,
    label: params.label,
    linkedAt: new Date().toISOString(),
  }
  saveAccount(link)
  await fetchEntitlement(link) // best-effort; keeps free-tier default if it fails
  return link
}

export interface OtpLinkParams {
  tunnelBaseUrl: string
  // One-time code minted by a signed-in session on the mother (device-link).
  code: string
  label: string
}

// Link via OTP: redeem a device-link code (no password ever typed here) for a
// session token, then register THIS instance. Persists like linkAccount.
export async function linkAccountWithCode(params: OtpLinkParams): Promise<AccountLink> {
  const base = params.tunnelBaseUrl.replace(/\/$/, '')

  const redeemRes = await fetch(`${base}/auth/device-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: params.code.trim(), deviceName: `orchester · ${params.label}` }),
  })
  if (!redeemRes.ok) {
    throw new Error(`code rejected: ${redeemRes.status} ${await safeText(redeemRes)}`)
  }
  const redeemed = (await redeemRes.json()) as { token: string; user: { email: string } }

  const regRes = await fetch(`${base}/instances/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${redeemed.token}` },
    body: JSON.stringify({ label: params.label }),
  })
  if (!regRes.ok) {
    throw new Error(`register failed: ${regRes.status} ${await safeText(regRes)}`)
  }
  const reg = (await regRes.json()) as { id: string; apiKey: string }

  const link: AccountLink = {
    tunnelBaseUrl: base,
    email: redeemed.user.email,
    sessionToken: redeemed.token,
    instanceId: reg.id,
    instanceKey: reg.apiKey,
    label: params.label,
    linkedAt: new Date().toISOString(),
  }
  saveAccount(link)
  await fetchEntitlement(link) // best-effort; keeps free-tier default if it fails
  return link
}

// Best-effort: revoke this instance on the mother and drop the local link.
export async function unlinkAccount(): Promise<void> {
  const link = loadAccount()
  clearAccount()
  if (!link) return
  const base = link.tunnelBaseUrl.replace(/\/$/, '')
  try {
    await fetch(`${base}/instances/${link.instanceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${link.sessionToken}` },
    })
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${link.sessionToken}` },
    })
  } catch {
    // Tunnel unreachable — the local link is gone, which is what matters.
  }
}

// http(s)://host:port → ws(s)://host:port/agent/connect
function toWsUrl(baseUrl: string): string {
  const u = new URL(baseUrl)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/agent/connect'
  return u.toString()
}

// Owns the outbound agent link driven by the account state. Bringing the WS up
// is what marks this instance "online" on the mother's dashboard. Shares are
// Fase 2; this only maintains presence.
export class AccountAgent {
  #agent: TunnelAgent | null = null
  // Periodic entitlement refresh so a plan change / renewal is picked up without
  // a restart. Offline failures are silently ignored (cached token rides its
  // grace window). Hourly is well inside the default staleAfter (~24h).
  #entTimer: ReturnType<typeof setInterval> | null = null

  get online(): boolean {
    return this.#agent !== null
  }

  // The live tunnel agent (null when not linked/connected). Callers use it to
  // register folder shares over the link (TunnelAgent.shareFolder).
  get agent(): TunnelAgent | null {
    return this.#agent
  }

  // Reconcile the live link with account.json: connect when linked, drop when not.
  async refresh(): Promise<void> {
    const link = loadAccount()
    if (!link) {
      this.stop()
      return
    }
    // Refresh the cached entitlement opportunistically (offline-safe: keeps the
    // old token on failure). Fire-and-forget — never blocks presence.
    void fetchEntitlement(link)
    // Keep it fresh on a timer so renewals/plan changes land without a restart.
    if (!this.#entTimer) {
      this.#entTimer = setInterval(() => {
        const l = loadAccount()
        if (l) void fetchEntitlement(l)
      }, 60 * 60 * 1000)
      if (typeof this.#entTimer.unref === 'function') this.#entTimer.unref()
    }
    if (this.#agent) return // already up
    const agent = new TunnelAgent({
      tunnelWsUrl: toWsUrl(link.tunnelBaseUrl),
      instanceId: link.instanceId,
      instanceKey: link.instanceKey,
      // Only used when sharing folders (Fase 2). Presence needs neither.
      coreBaseUrl: process.env['ELIO_CORE_URL'] ?? 'http://127.0.0.1:3001',
      masterToken: process.env['ELIO_MASTER_TOKEN'] ?? process.env['TOKEN'] ?? 'dev-token',
    })
    this.#agent = agent
    try {
      await agent.connect()
    } catch (e) {
      console.warn('[account] agent link failed:', String(e))
      this.#agent = null
    }
  }

  stop(): void {
    this.#agent?.close()
    this.#agent = null
    if (this.#entTimer) {
      clearInterval(this.#entTimer)
      this.#entTimer = null
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
