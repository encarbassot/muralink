// Local space — IndexedDB. Works fully offline, no backend, zero config. This
// is the default space for every collection; modules create one via this
// factory instead of hand-rolling idb plumbing. Extracted from the notes,
// contacts and calendar stores.

import { openDB, type IDBPDatabase } from 'idb'
import type { SpaceEntity, SpaceQuery, StorageSpace } from './space'
import { stamp } from './registry'

export interface IdbSpaceConfig<T extends SpaceEntity> {
  dbName: string // e.g. 'elio-notes'
  store: string // object store name, e.g. 'notes'
  id?: string // space id, default 'local'
  label?: string // default 'Este dispositivo'
  // Optional in-memory filter applied on list(). The calendar passes an
  // overlap test for from/to ranges; collections without ranges omit it.
  match?: (item: T, query: SpaceQuery) => boolean
}

// One connection per database, shared by every space that lives in it.
//
// This used to be one connection per *space*, opened at a hardcoded version 1.
// That silently lost stores: a module registering two collections in one
// database (habits + its checks, timers + their entries) would have the first
// open create its store and leave the database at version 1, so the second
// open — already at the current version — never ran `upgrade` and its store
// was never created. Every write to it then failed against a store that did
// not exist, and `listMerged` swallowed the read error as an empty list.
//
// Stores are therefore created on demand: read the current version, and if the
// store is missing, reopen one version higher to add it. Requests for the same
// database are chained so two collections asking at once cannot race for the
// same version bump.
const connections = new Map<string, Promise<IDBPDatabase>>()

function openStore(dbName: string, store: string): Promise<IDBPDatabase> {
  const pending = connections.get(dbName) ?? Promise.resolve(null as unknown as IDBPDatabase)

  const next = pending.then(async (open: IDBPDatabase | null) => {
    if (open && open.objectStoreNames.contains(store)) return open

    let db = open ?? (await openDB(dbName))
    if (db.objectStoreNames.contains(store)) return db

    // Adding a store is a version change, and a version change needs every
    // other connection to this database closed first — including ours.
    const version = db.version + 1
    db.close()
    db = await openDB(dbName, version, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' })
      },
      // Another tab holding an old connection blocks the upgrade. Closing on
      // `versionchange` is what lets that tab get out of the way instead of
      // deadlocking whichever one opened second.
      blocked() {
        console.warn(`[spaces] waiting for another tab to release ${dbName}`)
      },
    })
    return db
  })

  connections.set(
    dbName,
    // A failed open must not poison the database for every later caller.
    next.catch(() => openDB(dbName)),
  )
  return next
}

export function makeIdbSpace<T extends SpaceEntity>(cfg: IdbSpaceConfig<T>): StorageSpace<T> {
  const spaceId = cfg.id ?? 'local'

  function db(): Promise<IDBPDatabase> {
    return openStore(cfg.dbName, cfg.store)
  }

  return {
    id: spaceId,
    label: cfg.label ?? 'Este dispositivo',
    local: true,

    async list(query) {
      let all = (await (await db()).getAll(cfg.store)) as T[]
      if (query && cfg.match) all = all.filter((it) => cfg.match!(it, query))
      return stamp(spaceId, all)
    },

    async create(item) {
      // spaceId is runtime-only metadata — never persist it in the record.
      const { spaceId: _s, ...record } = item
      await (await db()).put(cfg.store, record)
      return { ...record, spaceId } as T
    },

    async update(id, patch) {
      const d = await db()
      const existing = (await d.get(cfg.store, id)) as T | undefined
      if (!existing) return
      const { spaceId: _s, ...clean } = patch
      const next = { ...existing, ...clean, id } as T
      await d.put(cfg.store, next)
      return { ...next, spaceId }
    },

    async remove(id) {
      await (await db()).delete(cfg.store, id)
    },
  }
}
