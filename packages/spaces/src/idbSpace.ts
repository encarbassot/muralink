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

export function makeIdbSpace<T extends SpaceEntity>(cfg: IdbSpaceConfig<T>): StorageSpace<T> {
  const spaceId = cfg.id ?? 'local'
  let dbPromise: Promise<IDBPDatabase> | null = null

  function db(): Promise<IDBPDatabase> {
    if (!dbPromise) {
      dbPromise = openDB(cfg.dbName, 1, {
        upgrade(d) {
          if (!d.objectStoreNames.contains(cfg.store)) {
            d.createObjectStore(cfg.store, { keyPath: 'id' })
          }
        },
      })
    }
    return dbPromise
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
