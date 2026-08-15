// Account session for the extension side panel. Per-platform copy of
// platforms/web/src/account.ts (the established pattern — each face carries
// its own thin auth file). localStorage works in extension pages (persistent
// per-extension origin); chrome.storage.local is the follow-up only if the
// service worker ever needs the token.

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
