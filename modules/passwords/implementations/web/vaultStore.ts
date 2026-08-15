// Vault persistence over storage spaces.
//
// What changed from the device-only version, and why: the vault used to refuse
// to leave the browser at all. That is the right default, but it also meant a
// self-hosted instance — a machine you own, in your house — could not hold your
// passwords, while your notes and files could. The rule was never "the vault
// must stay on this device"; it was "nobody but you may read the vault". So the
// vault now travels, and it travels sealed:
//
//   · the whole secret (url + username + password) is ONE ciphertext, so a
//     server learns not even which sites you have accounts on;
//   · the key is derived from the PIN in the browser and never persisted
//     anywhere, on any space;
//   · the server holds salt + verifier so a second device can unlock with the
//     same PIN — neither reveals the PIN, and neither helps decrypt anything.
//
// The host decides where it lands: this module registers the local space and
// nothing else. platforms/web registers the orchester space when a core is
// there (serverVault.ts). No space registered = exactly the old behaviour.

import { create } from 'zustand'
import {
  type SpaceId,
  registerSpace,
  makeIdbSpace,
  loadPrefs,
  persistPrefs,
  withDefault,
  withToggled,
  listMerged,
  spaceFor,
  getSpace,
} from '@muralink/spaces'
import type { YEncryptedBlob, YVaultEntry, YVaultMeta, YVaultRecord, YVaultSecret } from '../../types.ts'
import {
  checkVerifier,
  decryptText,
  deriveVaultKey,
  encryptText,
  generateSalt,
  isValidPin,
  makeVerifier,
} from './crypto.ts'

const COLLECTION = 'vault-entries'
const META_KEY = 'muralink-passwords-vault-meta'

registerSpace(
  COLLECTION,
  makeIdbSpace<YVaultRecord>({ dbName: 'muralink-passwords', store: 'entries' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

// ── vault meta ───────────────────────────────────────────────────────────────

// Where the salt + verifier live remotely. Injected by the host, same shape of
// seam as a storage space — this module never learns a URL. Absent = the vault
// is device-only and behaves exactly as before.
export interface VaultMetaRemote {
  get(): Promise<YVaultMeta | null>
  put(meta: YVaultMeta): Promise<void>
}

let metaRemote: VaultMetaRemote | null = null

export function setVaultMetaRemote(remote: VaultMetaRemote | null): void {
  metaRemote = remote
}

function loadMeta(): YVaultMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as YVaultMeta) : null
  } catch {
    return null
  }
}

function saveMeta(meta: YVaultMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

// ── records ──────────────────────────────────────────────────────────────────

function uid(): string {
  return `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Anything read from a space is one of the two shapes: the current sealed
// record, or a legacy entry with its url and username in the clear.
type StoredEntry = (YVaultRecord | YVaultEntry) & { spaceId?: string }

function isLegacy(entry: StoredEntry): entry is YVaultEntry & { spaceId?: string } {
  return 'encrypted' in entry && typeof (entry as YVaultEntry).url === 'string'
}

async function seal(key: CryptoKey, secret: YVaultSecret): Promise<YEncryptedBlob> {
  return encryptText(key, JSON.stringify(secret))
}

async function open(key: CryptoKey, blob: YEncryptedBlob): Promise<YVaultSecret> {
  return JSON.parse(await decryptText(key, blob)) as YVaultSecret
}

export interface DecryptedEntry extends YVaultSecret {
  id: string
  updatedAt: string
  spaceId?: string
}

interface VaultState {
  hasVault: boolean
  unlocked: boolean
  error?: string
  entries: DecryptedEntry[]
  key?: CryptoKey
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  init: () => void
  setup: (pin: string, confirm: string) => Promise<boolean>
  unlock: (pin: string) => Promise<boolean>
  lock: () => void
  add: (entry: YVaultSecret) => Promise<void>
  update: (id: string, patch: Partial<YVaultSecret>) => Promise<void>
  remove: (id: string) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useVault = create<VaultState>((set, get) => ({
  hasVault: false,
  unlocked: false,
  entries: [],
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  init() {
    set({ hasVault: !!loadMeta() })
    // A device that has never seen this vault has no local meta. If a remote
    // holds one, adopt it: the user then unlocks with the PIN they already
    // know, which is the whole point of putting the vault on a server.
    if (!metaRemote || loadMeta()) return
    void metaRemote
      .get()
      .then((meta) => {
        if (!meta) return
        saveMeta(meta)
        set({ hasVault: true })
      })
      .catch(() => {
        // Remote unreachable — stay offline-capable and silent.
      })
  },

  async setup(pin, confirm) {
    if (!isValidPin(pin)) {
      set({ error: 'El PIN debe tener 6 dígitos' })
      return false
    }
    if (pin !== confirm) {
      set({ error: 'Los PIN no coinciden' })
      return false
    }
    const salt = generateSalt()
    const key = await deriveVaultKey(pin, salt)
    const meta: YVaultMeta = { salt, verifier: await makeVerifier(key) }

    // Publish before trusting it locally: if a vault already exists remotely
    // under a different PIN, adopting this one here would leave the device
    // unable to read a single stored entry.
    if (metaRemote) {
      try {
        await metaRemote.put(meta)
      } catch (err) {
        set({ error: `No se pudo crear la bóveda en el servidor: ${String(err)}` })
        return false
      }
    }

    saveMeta(meta)
    set({ hasVault: true, unlocked: true, key, entries: [], error: undefined })
    return true
  },

  async unlock(pin) {
    const meta = loadMeta()
    if (!meta) return false
    if (!isValidPin(pin)) {
      set({ error: 'El PIN debe tener 6 dígitos' })
      return false
    }
    const key = await deriveVaultKey(pin, meta.salt)
    if (!(await checkVerifier(key, meta.verifier))) {
      set({ error: 'PIN incorrecto' })
      return false
    }

    const stored = await listMerged<StoredEntry>(COLLECTION, get().activeSpaces)
    const entries: DecryptedEntry[] = []

    for (const record of stored) {
      try {
        if (isLegacy(record)) {
          // Pre-sealed record: the password is encrypted, the rest is not.
          const secret: YVaultSecret = {
            url: record.url,
            username: record.username,
            password: await decryptText(key, record.encrypted),
          }
          const updatedAt = record.updatedAt ?? new Date().toISOString()
          entries.push({ id: record.id, ...secret, updatedAt, spaceId: record.spaceId })
          // Migrate in place. create() on the local space is a full replace, so
          // the plaintext url/username columns actually go away rather than
          // lingering next to the new blob.
          const space = getSpace<YVaultRecord>(COLLECTION, record.spaceId ?? 'local')
          if (space?.local) {
            await space.create({ id: record.id, blob: await seal(key, secret), updatedAt })
          }
        } else {
          const secret = await open(key, record.blob)
          entries.push({
            id: record.id,
            ...secret,
            updatedAt: record.updatedAt ?? '',
            spaceId: record.spaceId,
          })
        }
      } catch {
        // One unreadable record (written under a different PIN, or corrupt)
        // must not block the rest of the vault from opening.
        console.warn(`[passwords] entry ${record.id} could not be decrypted — skipped`)
      }
    }

    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    set({ unlocked: true, key, entries, error: undefined })
    return true
  },

  lock() {
    set({ unlocked: false, key: undefined, entries: [] })
  },

  async add(secret) {
    const { key, defaultSpace } = get()
    if (!key) return
    const updatedAt = new Date().toISOString()
    const space = spaceFor<YVaultRecord>(COLLECTION, undefined, defaultSpace)
    if (!space) return
    const created = await space.create({
      id: uid(),
      blob: await seal(key, secret),
      updatedAt,
    })
    set((s) => ({
      entries: [
        { id: created.id, ...secret, updatedAt: created.updatedAt ?? updatedAt, spaceId: created.spaceId },
        ...s.entries,
      ],
    }))
  },

  async update(id, patch) {
    const { key, entries, defaultSpace } = get()
    if (!key) return
    const current = entries.find((e) => e.id === id)
    if (!current) return
    const next: YVaultSecret = {
      url: patch.url ?? current.url,
      username: patch.username ?? current.username,
      password: patch.password ?? current.password,
    }
    const updatedAt = new Date().toISOString()
    // Every field lives inside the one ciphertext, so any edit rewrites all of it.
    const space = spaceFor<YVaultRecord>(COLLECTION, current, defaultSpace)
    if (!space) return
    await space.update(id, { blob: await seal(key, next), updatedAt })
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...next, updatedAt } : e)),
    }))
  },

  async remove(id) {
    const { entries, defaultSpace } = get()
    const current = entries.find((e) => e.id === id)
    const space = spaceFor<YVaultRecord>(COLLECTION, current, defaultSpace)
    await space?.remove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },

  setDefaultSpace(id) {
    const next = withDefault({ activeSpaces: get().activeSpaces, defaultSpace: get().defaultSpace }, id)
    persistPrefs(COLLECTION, next)
    set(next)
  },

  toggleSpace(id) {
    const next = withToggled({ activeSpaces: get().activeSpaces, defaultSpace: get().defaultSpace }, id)
    persistPrefs(COLLECTION, next)
    set(next)
    // Reading a newly activated space needs the derived key, and re-deriving it
    // needs the PIN. Locking is the honest outcome: the user re-enters the PIN
    // once and sees the merged vault.
    if (get().unlocked) set({ unlocked: false, key: undefined, entries: [] })
  },
}))
