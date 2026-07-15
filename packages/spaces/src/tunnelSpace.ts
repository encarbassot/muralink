// Tunnel space — encrypted cloud backup (State 3). Every item is AES-GCM
// encrypted in the browser with a key derived from the user's passphrase
// (PBKDF2); the tunnel server stores opaque ciphertext it cannot read — the
// technical form of "we don't want your data". Only `updatedAt` travels in
// plaintext so last-write-wins works without decrypting.
//
// The passphrase never leaves the device. Lose it = the backup is
// unrecoverable by design; there is no server-side reset.

import type { SpaceEntity, StorageSpace } from './space'
import { stamp } from './registry'

export interface TunnelSpaceConfig {
  /** Tunnel API base, no trailing slash, e.g. 'https://tunnel.elio.dev'. */
  url: string
  /** Tunnel session token (the user's account login). */
  token: string
  /** Encryption passphrase — device-side only, never sent. */
  passphrase: string
  /** Which collection this space stores ('notes', 'reminders', …). */
  collection: string
  id?: string // space id, default 'tunnel'
  label?: string // default 'Nube (cifrado)'
}

const PBKDF2_ITERATIONS = 250_000
const SALT = new TextEncoder().encode('elio-tunnel-backup-v1')

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function encrypt(key: CryptoKey, json: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(json),
  )
  const packed = new Uint8Array(iv.length + data.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(data), iv.length)
  return toBase64(packed)
}

async function decrypt(key: CryptoKey, b64: string): Promise<string> {
  const packed = fromBase64(b64)
  const iv = packed.slice(0, 12)
  const data = packed.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

export function makeTunnelSpace<T extends SpaceEntity>(cfg: TunnelSpaceConfig): StorageSpace<T> {
  const spaceId = cfg.id ?? 'tunnel'
  const base = cfg.url.replace(/\/$/, '')
  const keyPromise = deriveKey(cfg.passphrase)
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
  }

  async function req<R>(path: string, init?: RequestInit): Promise<R> {
    const res = await fetch(`${base}/backup/${cfg.collection}${path}`, { ...init, headers })
    if (!res.ok) throw new Error(`tunnel backup ${cfg.collection} ${res.status}`)
    if (res.status === 204) return undefined as R
    return (await res.json()) as R
  }

  async function put(item: T): Promise<T> {
    const key = await keyPromise
    const { spaceId: _s, ...record } = item
    const updatedAt = item.updatedAt ?? new Date().toISOString()
    await req<void>(`/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        updatedAt,
        ciphertext: await encrypt(key, JSON.stringify(record)),
      }),
    })
    return { ...record, updatedAt, spaceId } as T
  }

  return {
    id: spaceId,
    label: cfg.label ?? 'Nube (cifrado)',
    local: false,

    // Backups list ids first, then fetch + decrypt each item. Fine for the
    // MVP volumes this targets (personal notes/reminders, not bulk data).
    async list() {
      const key = await keyPromise
      const ids = await req<{ id: string; updatedAt: string }[]>('')
      const items = await Promise.all(
        ids.map(async ({ id }) => {
          const row = await req<{ ciphertext: string }>(`/${id}`)
          return JSON.parse(await decrypt(key, row.ciphertext)) as T
        }),
      )
      return stamp(spaceId, items)
    },

    create: put,

    async update(id, patch) {
      const key = await keyPromise
      const row = await req<{ ciphertext: string }>(`/${id}`)
      const existing = JSON.parse(await decrypt(key, row.ciphertext)) as T
      const { spaceId: _s, ...clean } = patch
      return put({ ...existing, ...clean, id } as T)
    },

    async remove(id) {
      await req<void>(`/${id}`, { method: 'DELETE' })
    },
  }
}
