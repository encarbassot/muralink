// Local-first reminders persistence over storage spaces. A reminder lives in
// exactly one space — this device (IndexedDB, default) or the company server
// for shared team lists. Mirrors the notes/contacts/calendar stores so every
// embeddable module behaves the same.

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
import type { YReminder } from '../../types.ts'

const COLLECTION = 'reminders'

// The default space is always available.
registerSpace(
  COLLECTION,
  makeIdbSpace<YReminder>({ dbName: 'elio-reminders', store: 'reminders' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(): string {
  return `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Open first (due date asc, undated last), done at the bottom (newest first).
function order(a: YReminder, b: YReminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (a.done) return b.updatedAt.localeCompare(a.updatedAt)
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt || b.dueAt) return a.dueAt ? -1 : 1
  return b.updatedAt.localeCompare(a.updatedAt)
}

interface RemindersState {
  reminders: YReminder[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  create: (partial?: Partial<YReminder>) => Promise<YReminder>
  update: (id: string, patch: Partial<YReminder>) => Promise<void>
  toggle: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  moveReminder: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useReminders = create<RemindersState>((set, get) => ({
  reminders: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const all = await listMerged<YReminder>(COLLECTION, get().activeSpaces)
    all.sort(order)
    set({ reminders: all, loaded: true })
  },

  async create(partial) {
    const space = spaceFor<YReminder>(COLLECTION, undefined, get().defaultSpace)
    const reminder: YReminder = {
      id: uid(),
      title: partial?.title ?? '',
      done: partial?.done ?? false,
      dueAt: partial?.dueAt,
      assignee: partial?.assignee,
      createdBy: partial?.createdBy,
      updatedAt: new Date().toISOString(),
    }
    if (!space) return reminder
    const created = await space.create(reminder)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ reminders: [...s.reminders, created].sort(order) }))
    }
    return created
  },

  async update(id, patch) {
    const existing = get().reminders.find((r) => r.id === id)
    if (!existing) return
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, { ...patch, updatedAt: new Date().toISOString() })
    if (!next) return
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? next : r)).sort(order),
    }))
  },

  async toggle(id) {
    const existing = get().reminders.find((r) => r.id === id)
    if (!existing) return
    await get().update(id, { done: !existing.done })
  },

  async remove(id) {
    const existing = get().reminders.find((r) => r.id === id)
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }))
  },

  async moveReminder(id, toSpace) {
    const existing = get().reminders.find((r) => r.id === id)
    if (!existing) return
    const created = await moveItem(COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? created : r)).sort(order),
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
