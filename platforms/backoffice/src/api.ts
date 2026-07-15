const BASE = '/api'

function token(): string | null {
  return localStorage.getItem('token')
}

function headers(): HeadersInit {
  const t = token()
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: headers(), ...init })
  const body = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Request failed')
  return body
}

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      request<{ token: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () =>
      request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () =>
      request<{ user: User }>('/auth/me'),
  },
  instances: {
    list: () =>
      request<{ instances: Instance[] }>('/instances'),
    register: (label: string) =>
      request<{ id: string; label: string; apiKey: string; createdAt: string; note: string }>('/instances/register', {
        method: 'POST',
        body: JSON.stringify({ label }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/instances/${id}`, { method: 'DELETE' }),
  },
}

export interface User {
  id: string
  email: string
  createdAt: string
}

export interface Instance {
  id: string
  label: string
  lastSeen: string | null
  createdAt: string
}
