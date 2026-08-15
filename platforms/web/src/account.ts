// Account session for the localhost web build. This is the "orchester" login:
// authenticate ONCE against the Muralink cloud (master-api) and the same token
// then authorises every synced module space (see cloudVault.ts). The base app
// keeps talking to the LOCAL core; only the cloud module spaces use this token.
//
// The cloud origin is absolute (this page is served from localhost, the API
// lives at app.mural.ink), overridable for dev via VITE_MURALINK_CLOUD_URL.

const KEY = 'muralink_account_token'

export const CLOUD_ORIGIN = (
  (import.meta.env['VITE_MURALINK_CLOUD_URL'] as string | undefined) ?? 'https://app.mural.ink'
).replace(/\/$/, '')

export interface Account {
  id: string
  email: string
  isAdmin?: boolean
}

export function getAccountToken(): string | null {
  return localStorage.getItem(KEY)
}
export function setAccountToken(token: string): void {
  localStorage.setItem(KEY, token)
}
export function clearAccountToken(): void {
  localStorage.removeItem(KEY)
}

export async function login(email: string, password: string): Promise<{ token: string; user: Account }> {
  const res = await fetch(`${CLOUD_ORIGIN}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Inicio de sesión falló (${res.status})`)
  }
  return res.json() as Promise<{ token: string; user: Account }>
}

// Validate a stored token; returns the account or null when it's stale/revoked.
export async function fetchMe(token: string): Promise<Account | null> {
  try {
    const res = await fetch(`${CLOUD_ORIGIN}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: Account }
    return data.user ?? null
  } catch {
    return null
  }
}

export async function logout(token: string): Promise<void> {
  await fetch(`${CLOUD_ORIGIN}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
}
