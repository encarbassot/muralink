// My own published locations (YContactLocation) — server-resident for the same
// reason as trustGroupsStore: a linked contact's poll hits MY server directly,
// so the data it answers from must live there, not in this device's IndexedDB.

import { create } from 'zustand'
import type { YContactLocation } from '../../types.ts'
import { authHeaders } from './apiToken.ts'

interface MyLocationsState {
  locations: YContactLocation[]
  loaded: boolean
  loadAll: () => Promise<void>
  create: (partial: Pick<YContactLocation, 'point'> & Partial<YContactLocation>) => Promise<YContactLocation | undefined>
  update: (id: string, patch: Partial<Omit<YContactLocation, 'id' | 'createdAt'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useMyLocations = create<MyLocationsState>((set, get) => ({
  locations: [],
  loaded: false,

  async loadAll() {
    const res = await fetch('/api/contacts/locations', { headers: authHeaders() })
    if (!res.ok) { set({ loaded: true }); return }
    const locations = (await res.json()) as YContactLocation[]
    set({ locations, loaded: true })
  },

  async create(partial) {
    const res = await fetch('/api/contacts/locations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(partial),
    })
    if (!res.ok) return undefined
    const loc = (await res.json()) as YContactLocation
    set((s) => ({ locations: [loc, ...s.locations] }))
    return loc
  },

  async update(id, patch) {
    const res = await fetch(`/api/contacts/locations/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    })
    if (!res.ok) return
    const updated = (await res.json()) as YContactLocation
    set((s) => ({ locations: s.locations.map((l) => (l.id === id ? updated : l)) }))
  },

  async remove(id) {
    const res = await fetch(`/api/contacts/locations/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (!res.ok && res.status !== 404) return
    set((s) => ({ locations: s.locations.filter((l) => l.id !== id) }))
  },
}))

export function ensureMyLocationsLoaded() {
  const { loaded, loadAll } = useMyLocations.getState()
  if (!loaded) void loadAll()
}
