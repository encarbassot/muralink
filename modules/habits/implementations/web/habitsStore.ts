// Local-first habits persistence over storage spaces. Two collections share
// one space configuration: 'habits' (definitions) and 'habit-checks' (one row
// per habit per local day). Mirrors the reminders/tracker store shape.

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
import type { YHabitDef, YHabitCheck } from '../../types.ts'
import { findCheck, todayKey } from '../../logic.ts'

export const HABITS_COLLECTION = 'habits'
export const CHECKS_COLLECTION = 'habit-checks'
const PREFS_KEY = 'habits'

// The default spaces are always available.
registerSpace(
  HABITS_COLLECTION,
  makeIdbSpace<YHabitDef>({ dbName: 'elio-habits', store: 'habits' }),
)
registerSpace(
  CHECKS_COLLECTION,
  makeIdbSpace<YHabitCheck>({ dbName: 'elio-habits', store: 'checks' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function bySort(a: YHabitDef, b: YHabitDef): number {
  if ((a.sort ?? 0) !== (b.sort ?? 0)) return (a.sort ?? 0) - (b.sort ?? 0)
  return a.title.localeCompare(b.title)
}

interface HabitsState {
  habits: YHabitDef[]
  checks: YHabitCheck[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  createHabit: (partial?: Partial<YHabitDef>) => Promise<YHabitDef>
  updateHabit: (id: string, patch: Partial<YHabitDef>) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  /** Toggle the check for (habit, day). Looks up the existing row first — never
   *  blind-creates, so the server's UNIQUE(habit_id, date) can't be violated. */
  toggleCheck: (habitId: string, dateKey?: string) => Promise<void>
  moveHabit: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(PREFS_KEY)

export const useHabits = create<HabitsState>((set, get) => ({
  habits: [],
  checks: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const [habits, checks] = await Promise.all([
      listMerged<YHabitDef>(HABITS_COLLECTION, get().activeSpaces),
      listMerged<YHabitCheck>(CHECKS_COLLECTION, get().activeSpaces),
    ])
    habits.sort(bySort)
    set({ habits, checks, loaded: true })
  },

  async createHabit(partial) {
    const space = spaceFor<YHabitDef>(HABITS_COLLECTION, undefined, get().defaultSpace)
    const habit: YHabitDef = {
      id: partial?.id ?? uid('hab'),
      title: partial?.title?.trim() || 'Nuevo hábito',
      icon: partial?.icon ?? '✅',
      polarity: partial?.polarity ?? 'good',
      rrule: partial?.rrule,
      reminderId: partial?.reminderId,
      timerId: partial?.timerId,
      sort: partial?.sort ?? get().habits.length,
      updatedAt: new Date().toISOString(),
    }
    if (!space) return habit
    const created = await space.create(habit)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ habits: [...s.habits, created].sort(bySort) }))
    }
    return created
  },

  async updateHabit(id, patch) {
    const existing = get().habits.find((h) => h.id === id)
    if (!existing) return
    const space = spaceFor(HABITS_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, { ...patch, updatedAt: new Date().toISOString() })
    if (!next) return
    set((s) => ({ habits: s.habits.map((h) => (h.id === id ? next : h)).sort(bySort) }))
  },

  async removeHabit(id) {
    const existing = get().habits.find((h) => h.id === id)
    const space = spaceFor(HABITS_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    // Drop its checks too (best effort, same space routing per check).
    const orphans = get().checks.filter((c) => c.habitId === id)
    for (const c of orphans) {
      const cSpace = spaceFor(CHECKS_COLLECTION, c, get().defaultSpace)
      await cSpace?.remove(c.id).catch(() => {})
    }
    set((s) => ({
      habits: s.habits.filter((h) => h.id !== id),
      checks: s.checks.filter((c) => c.habitId !== id),
    }))
  },

  async toggleCheck(habitId, dateKey) {
    const date = dateKey ?? todayKey()
    const existing = findCheck(get().checks, habitId, date)
    if (existing) {
      const space = spaceFor(CHECKS_COLLECTION, existing, get().defaultSpace)
      if (!space) return
      await space.remove(existing.id)
      set((s) => ({ checks: s.checks.filter((c) => c.id !== existing.id) }))
      return
    }
    const space = spaceFor<YHabitCheck>(CHECKS_COLLECTION, undefined, get().defaultSpace)
    if (!space) return
    const check: YHabitCheck = {
      id: uid('chk'),
      habitId,
      date,
      checkedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const created = await space.create(check)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ checks: [...s.checks, created] }))
    }
  },

  async moveHabit(id, toSpace) {
    const existing = get().habits.find((h) => h.id === id)
    if (!existing) return
    const created = await moveItem(HABITS_COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({ habits: s.habits.map((h) => (h.id === id ? created : h)) }))
  },

  setDefaultSpace(id) {
    set((s) => {
      const next = withDefault({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(PREFS_KEY, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },

  toggleSpace(id) {
    set((s) => {
      const next = withToggled({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(PREFS_KEY, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },
}))
