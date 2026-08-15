// Local cache of a linked contact's last successful location poll. IDB-backed
// like preparedStore — this is MY device's read-only cache of THEIR published
// data, distinct from myLocationsStore (what I publish) and trustGroupsStore
// (who I publish to).

import { create } from 'zustand'
import { registerSpace, makeIdbSpace, listMerged, spaceFor } from '@muralink/spaces'
import type { YContactLocationCache } from '../../types.ts'

const COLLECTION = 'contact-location-cache'

registerSpace(
  COLLECTION,
  makeIdbSpace<YContactLocationCache>({ dbName: 'elio-contacts-location-cache', store: 'cache' }),
)

interface CacheState {
  byContact: Record<string, YContactLocationCache | undefined>
  load: (contactId: string) => Promise<YContactLocationCache | undefined>
  save: (entry: YContactLocationCache) => Promise<void>
}

export const useContactLocationCache = create<CacheState>((set, get) => ({
  byContact: {},

  async load(contactId) {
    const all = await listMerged<YContactLocationCache>(COLLECTION, ['local'])
    const entry = all.find((e) => e.contactId === contactId)
    set((s) => ({ byContact: { ...s.byContact, [contactId]: entry } }))
    return entry
  },

  async save(entry) {
    const existing = get().byContact[entry.contactId]
    const space = spaceFor<YContactLocationCache>(COLLECTION, existing, 'local')
    if (!space) return
    const saved = existing
      ? ((await space.update(entry.id, entry)) ?? (await space.create(entry)))
      : await space.create(entry)
    set((s) => ({ byContact: { ...s.byContact, [entry.contactId]: saved } }))
  },
}))
