// Tunnel API client for the Electron main process.
// Session token persisted in userData/tunnel/session.json.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { networkInterfaces } from 'node:os'
import { app } from 'electron'

const TUNNEL_BASE = process.env['TUNNEL_URL'] ?? 'http://localhost:4000'

export interface ShareOpts {
  hostIp: string
  hostPort: number
  rootPath: string
  password: string
  expiresAt?: string | null
}

export interface ShareResult {
  id: string
  token: string
  url: string
  expiresAt: string | null
}

export interface ShareInfo {
  id: string
  rootPath: string
  hostIp: string
  hostPort: number
  expiresAt: string | null
  createdAt: string
}

function tokenPath(): string {
  const dir = join(app.getPath('userData'), 'tunnel')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'session.json')
}

function loadToken(): string | null {
  try {
    const raw = readFileSync(tokenPath(), 'utf8')
    const data = JSON.parse(raw) as { token?: string }
    return data.token ?? null
  } catch {
    return null
  }
}

function saveToken(token: string): void {
  writeFileSync(tokenPath(), JSON.stringify({ token }), 'utf8')
}

function clearToken(): void {
  try { writeFileSync(tokenPath(), '{}', 'utf8') } catch { /* ignore */ }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = loadToken()
  if (!token) throw new Error('not-logged-in')
  return fetch(`${TUNNEL_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

export const tunnelClient = {
  async login(email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }> {
    const res = await fetch(`${TUNNEL_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      throw new Error(err.error ?? 'Login failed')
    }
    const data = await res.json() as { token: string; user: { id: string; email: string } }
    saveToken(data.token)
    return data
  },

  isLoggedIn(): boolean {
    return loadToken() !== null
  },

  logout(): void {
    clearToken()
  },

  async createShare(opts: ShareOpts): Promise<ShareResult> {
    const res = await authedFetch('/shares', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      throw new Error(err.error ?? 'Failed to create share')
    }
    return res.json() as Promise<ShareResult>
  },

  async listShares(): Promise<ShareInfo[]> {
    const res = await authedFetch('/shares')
    if (!res.ok) throw new Error('Failed to list shares')
    const data = await res.json() as { shares: ShareInfo[] }
    return data.shares
  },

  async revokeShare(id: string): Promise<void> {
    const res = await authedFetch(`/shares/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to revoke share')
  },

  getLanIp(): string | null {
    const nets = networkInterfaces()
    for (const iface of Object.values(nets)) {
      if (!iface) continue
      for (const n of iface) {
        if (n.family === 'IPv4' && !n.internal) return n.address
      }
    }
    return null
  },

  async getPublicIp(): Promise<string> {
    const res = await fetch('https://api.ipify.org?format=json')
    if (!res.ok) throw new Error('Could not detect public IP')
    const data = await res.json() as { ip: string }
    return data.ip
  },
}
