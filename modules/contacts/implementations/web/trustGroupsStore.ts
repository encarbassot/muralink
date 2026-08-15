// Trust groups live on MY server (not client IndexedDB) — the scoped-guest
// route (/api/contacts/shared-locations) evaluates canView against this same
// server-side table, so the data a linked contact sees must be authoritative
// here, not just cached on this device. Plain REST client, like preparedStore
// talks to its own routes, but without the offline-first spaces indirection.

import { create } from 'zustand'
import type { TrustGroup } from '@muralink/types'
import { authHeaders } from './apiToken.ts'

interface TrustGroupsState {
  groups: TrustGroup[]
  loaded: boolean
  loadAll: () => Promise<void>
  create: (name: string) => Promise<TrustGroup | undefined>
  update: (id: string, patch: Partial<Omit<TrustGroup, 'id' | 'createdAt'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTrustGroups = create<TrustGroupsState>((set, get) => ({
  groups: [],
  loaded: false,

  async loadAll() {
    const res = await fetch('/api/contacts/trust-groups', { headers: authHeaders() })
    if (!res.ok) { set({ loaded: true }); return }
    const groups = (await res.json()) as TrustGroup[]
    set({ groups, loaded: true })
  },

  async create(name) {
    const res = await fetch('/api/contacts/trust-groups', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, memberEmails: [] }),
    })
    if (!res.ok) return undefined
    const group = (await res.json()) as TrustGroup
    set((s) => ({ groups: [...s.groups, group] }))
    return group
  },

  async update(id, patch) {
    const res = await fetch(`/api/contacts/trust-groups/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    })
    if (!res.ok) return
    const updated = (await res.json()) as TrustGroup
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? updated : g)) }))
  },

  async remove(id) {
    const res = await fetch(`/api/contacts/trust-groups/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (!res.ok && res.status !== 404) return
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }))
  },
}))

// Convenience for callers that just need the list loaded once.
export function ensureTrustGroupsLoaded() {
  const { loaded, loadAll } = useTrustGroups.getState()
  if (!loaded) void loadAll()
}
