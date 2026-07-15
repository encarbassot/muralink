// Local-first notes persistence over storage spaces. A note lives in exactly
// one space — this device (IndexedDB, default), the company server, or the
// encrypted cloud backup. The store reads every active space, merges, and
// routes writes back to each note's own space. Hook shape is unchanged from
// the pre-spaces version; space controls are additive.

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
import type { YNote } from '../../types.ts'

const COLLECTION = 'notes'

// The default space is always available.
registerSpace(
  COLLECTION,
  makeIdbSpace<YNote>({ dbName: 'elio-notes', store: 'notes' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function byUpdated(a: YNote, b: YNote): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}

interface NotesState {
  notes: YNote[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  get: (id: string) => YNote | undefined
  create: (partial?: Partial<YNote>) => Promise<YNote>
  update: (id: string, patch: Partial<YNote>) => Promise<void>
  remove: (id: string) => Promise<void>
  moveNote: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useNotes = create<NotesState>((set, get) => ({
  notes: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const all = await listMerged<YNote>(COLLECTION, get().activeSpaces)
    all.sort(byUpdated)
    set({ notes: all, loaded: true })
  },

  get(id) {
    return get().notes.find((n) => n.id === id)
  },

  async create(partial) {
    const space = spaceFor<YNote>(COLLECTION, undefined, get().defaultSpace)
    const note: YNote = {
      id: partial?.id ?? uid(),
      title: partial?.title ?? 'Untitled',
      body: partial?.body ?? '',
      color: partial?.color,
      updatedAt: new Date().toISOString(),
    }
    if (!space) return note
    const created = await space.create(note)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ notes: [created, ...s.notes] }))
    }
    return created
  },

  async update(id, patch) {
    const existing = get().notes.find((n) => n.id === id)
    if (!existing) return
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    if (!next) return
    set((s) => ({ notes: [next, ...s.notes.filter((n) => n.id !== id)] }))
  },

  async remove(id) {
    const existing = get().notes.find((n) => n.id === id)
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },

  async moveNote(id, toSpace) {
    const existing = get().notes.find((n) => n.id === id)
    if (!existing) return
    const created = await moveItem(COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? created : n)).sort(byUpdated),
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
