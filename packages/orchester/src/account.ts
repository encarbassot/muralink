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

  get online(): boolean {
    return this.#agent !== null
  }

  // Reconcile the live link with account.json: connect when linked, drop when not.
  async refresh(): Promise<void> {
    const link = loadAccount()
    if (!link) {
      this.stop()
      return
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
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
