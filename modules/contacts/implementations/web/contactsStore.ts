// Local-first contacts persistence over storage spaces. A contact lives in
// exactly one space — this device (IndexedDB, default), the company server, or
// a read-only external adapter (e.g. the host platform's CRM). Mirrors the
// notes and calendar stores so every embeddable module behaves the same.

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
  moveItem,
} from '@muralink/spaces'
import type { YContact } from '../../types.ts'

const COLLECTION = 'contacts'

// The default space is always available.
registerSpace(
  COLLECTION,
  makeIdbSpace<YContact>({ dbName: 'elio-contacts', store: 'contacts' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(): string {
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function byName(a: YContact, b: YContact): number {
  return a.name.localeCompare(b.name)
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

interface ContactsState {
  contacts: YContact[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  get: (id: string) => YContact | undefined
  create: (partial?: Partial<YContact>) => Promise<YContact>
  update: (id: string, patch: Partial<YContact>) => Promise<void>
  remove: (id: string) => Promise<void>
  moveContact: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useContacts = create<ContactsState>((set, get) => ({
  contacts: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const all = await listMerged<YContact>(COLLECTION, get().activeSpaces)
    all.sort(byName)
    set({ contacts: all, loaded: true })
  },

  get(id) {
    return get().contacts.find((c) => c.id === id)
  },

  async create(partial) {
    const space = spaceFor<YContact>(COLLECTION, undefined, get().defaultSpace)
    const contact: YContact = {
      id: uid(),
      name: partial?.name ?? 'Nuevo contacto',
      phone: partial?.phone,
      email: partial?.email,
      notes: partial?.notes,
      createdAt: partial?.createdAt ?? { iso: new Date().toISOString(), timezone: TZ },
    }
    if (!space) return contact
    const created = await space.create(contact)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ contacts: [...s.contacts, created].sort(byName) }))
    }
    return created
  },

  async update(id, patch) {
    const cur = get().contacts.find((c) => c.id === id)
    if (!cur) return
    const space = spaceFor(COLLECTION, cur, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, patch)
    if (!next) return
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? next : c)).sort(byName),
    }))
  },

  async remove(id) {
    const cur = get().contacts.find((c) => c.id === id)
    const space = spaceFor(COLLECTION, cur, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }))
  },

  async moveContact(id, toSpace) {
    const cur = get().contacts.find((c) => c.id === id)
    if (!cur) return
    const created = await moveItem(COLLECTION, cur, toSpace)
    if (!created) return
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? created : c)).sort(byName),
    }))
  },

  setDefaultSpace(id) {
    set((s) => {
      const next = withDefault({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(COLLECTION, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },

  toggleSpace(id) {
    set((s) => {
      const next = withToggled({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(COLLECTION, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },
}))
