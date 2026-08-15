// Collab space — shared-workspace cloud sync (State 3, enterprise). The multi-
// writer twin of tunnelSpace: several authenticated users edit ONE workspace and
// every write is stamped with its author (`who`, sent as X-Mural-User). The
// master API authorizes that author against the subscription's seats (who→seat)
// before storing — an unauthorized author is refused, so multi-user in the cloud
// cannot be forged by a client. See muralink-cloud master-api routes/collab.ts.
//
// Like tunnelSpace, payloads are AES-GCM encrypted client-side and the server
// keeps only opaque ciphertext ("we don't want your data"). The difference: the
// key is a WORKSPACE key shared by all seats (they edit the same data), not a
// per-device passphrase, and each item carries a plaintext author for coordinat-
// ion. Only author + updatedAt are plaintext; the record itself is never read by
// the server.

import type { SpaceEntity, StorageSpace } from './space'
import { stamp } from './registry'

export interface CollabSpaceConfig {
  /** Master API base, no trailing slash, e.g. 'https://api.mural.ink'. */
  url: string
  /** Account session token (the subscription owner / Orchester link). */
  token: string
  /** The current author's verified id — sent as X-Mural-User, gated who→seat. */
  who: string
  /** Shared workspace encryption passphrase — device-side only, never sent. */
  passphrase: string
  /** Which collection this space stores ('notes', 'reminders', …). */
  collection: string
  id?: string // space id, default 'collab'
  label?: string // default 'Workspace (compartido)'
}

const PBKDF2_ITERATIONS = 250_000
// Distinct salt from tunnelSpace — a workspace key is a different secret domain.
const SALT = new TextEncoder().encode('muralink-collab-workspace-v1')

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

export function makeCollabSpace<T extends SpaceEntity>(cfg: CollabSpaceConfig): StorageSpace<T> {
  const spaceId = cfg.id ?? 'collab'
  const base = cfg.url.replace(/\/$/, '')
  const keyPromise = deriveKey(cfg.passphrase)
  // X-Mural-User is the author the server gates who→seat and stores as authorship.
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
    'X-Mural-User': cfg.who,
  }

  async function req<R>(path: string, init?: RequestInit): Promise<R> {
    const res = await fetch(`${base}/collab/${cfg.collection}${path}`, { ...init, headers })
    if (!res.ok) throw new Error(`collab ${cfg.collection} ${res.status}`)
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
    label: cfg.label ?? 'Workspace (compartido)',
    local: false,

    // List authored ids, then fetch + decrypt each. Fine for MVP volumes.
    async list() {
      const key = await keyPromise
      const ids = await req<{ id: string; updatedAt: string; author: string }[]>('')
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
