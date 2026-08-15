// Local-first ledger persistence over storage spaces. An entry lives in exactly
// one space — this device (IndexedDB, default), the orchester server, or an
// encrypted cloud space. Mirrors the contacts/notes stores so the module
// behaves like every other embeddable one. All balances are derived, never
// stored: the store keeps a flat list of movements and slices/sums per account.

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
import type { YExpenseEntry, ProvidedBy } from '../../types.ts'
import { euros, balanceOf } from '../../types.ts'

const COLLECTION = 'expenses'

// The default space is always available (works fully offline).
registerSpace(
  COLLECTION,
  makeIdbSpace<YExpenseEntry>({ dbName: 'elio-expenses', store: 'entries' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

// Oldest first, so a running balance reads top→bottom exactly like the sheet.
function byCreated(a: YExpenseEntry, b: YExpenseEntry): number {
  return a.createdAt.iso.localeCompare(b.createdAt.iso)
}

// What the UI collects for a new movement: a positive magnitude + who put it in.
// The signed amount is derived here so no view has to reason about the sign.
export interface NewMovement {
  accountId: string
  providedBy: ProvidedBy
  amount: number // major-unit magnitude, always >= 0
  description: string
  dateText?: string
  hours?: number
  km?: number
  notes?: string
}

interface ExpensesState {
  entries: YExpenseEntry[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  entriesFor: (accountId: string) => YExpenseEntry[]
  balanceFor: (accountId: string) => ReturnType<typeof balanceOf>
  accountIds: () => string[]
  add: (m: NewMovement) => Promise<YExpenseEntry | undefined>
  update: (id: string, patch: Partial<YExpenseEntry>) => Promise<void>
  remove: (id: string) => Promise<void>
  // Creates the counter-movement that brings the account balance to 0.
  settle: (accountId: string, dateText?: string) => Promise<void>
  moveEntry: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useExpenses = create<ExpensesState>((set, get) => ({
  entries: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const all = await listMerged<YExpenseEntry>(COLLECTION, get().activeSpaces)
    all.sort(byCreated)
    set({ entries: all, loaded: true })
  },

  entriesFor(accountId) {
    return get().entries.filter((e) => e.accountId === accountId)
  },

  balanceFor(accountId) {
    return balanceOf(get().entries.filter((e) => e.accountId === accountId))
  },

  accountIds() {
    return [...new Set(get().entries.map((e) => e.accountId))]
  },

  async add(m) {
    const space = spaceFor<YExpenseEntry>(COLLECTION, undefined, get().defaultSpace)
    const magnitude = Math.abs(m.amount)
    const entry: YExpenseEntry = {
      id: uid(),
      accountId: m.accountId,
      amount: euros(m.providedBy === 'me' ? magnitude : -magnitude),
      providedBy: m.providedBy,
      description: m.description,
      dateText: m.dateText,
      hours: m.hours,
      km: m.km,
      notes: m.notes,
      createdAt: { iso: new Date().toISOString(), timezone: TZ },
    }
    if (!space) return entry
    const created = await space.create(entry)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ entries: [...s.entries, created].sort(byCreated) }))
    }
    return created
  },

  async update(id, patch) {
    const cur = get().entries.find((e) => e.id === id)
    if (!cur) return
    const space = spaceFor(COLLECTION, cur, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, patch)
    if (!next) return
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)).sort(byCreated) }))
  },

  async remove(id) {
    const cur = get().entries.find((e) => e.id === id)
    const space = spaceFor(COLLECTION, cur, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },

  async settle(accountId, dateText) {
    const bal = get().balanceFor(accountId)
    if (bal.amount === 0) return
    // A positive balance means the counterparty owes me → they provide the
    // settling amount (a negative movement). Negative balance → I provide it.
    await get().add({
      accountId,
      providedBy: bal.amount > 0 ? 'them' : 'me',
      amount: Math.abs(bal.amount) / 10 ** bal.precision,
      description: 'Saldar cuentas',
      dateText,
    })
  },

  async moveEntry(id, toSpace) {
    const cur = get().entries.find((e) => e.id === id)
    if (!cur) return
    const created = await moveItem(COLLECTION, cur, toSpace)
    if (!created) return
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? created : e)).sort(byCreated) }))
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
