// Local-first tracker persistence over storage spaces. Two collections share
// one space configuration: 'tracker-timers' (the buttons) and 'time-entries'
// (the elapsed spans). Mirrors the reminders/notes store shape.
//
// Record creation happens only inside store methods (event-handler paths) —
// never in mount effects — so StrictMode double effects can't duplicate rows.

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
import type { YTimerDef, YTimeEntry } from '../../types.ts'
import { isRunning, runningEntry, toDateTime } from '../../time.ts'

export const TIMERS_COLLECTION = 'tracker-timers'
export const ENTRIES_COLLECTION = 'time-entries'
// One prefs key for both collections — a timer and its entries live in the
// same place, so the space choice is a single decision.
const PREFS_KEY = 'tracker'

// The default spaces are always available.
registerSpace(
  TIMERS_COLLECTION,
  makeIdbSpace<YTimerDef>({ dbName: 'elio-tracker', store: 'timers' }),
)
registerSpace(
  ENTRIES_COLLECTION,
  makeIdbSpace<YTimeEntry>({ dbName: 'elio-tracker', store: 'entries' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const TIMER_EMOJIS = ['⏱️', '🎯', '🛠️', '📚', '🎨', '🏃', '💼', '🧪', '🌱', '🎸']

function randomTimerEmoji(): string {
  return TIMER_EMOJIS[Math.floor(Math.random() * TIMER_EMOJIS.length)]!
}

// Host-injected mural factory (composition root wires it): lets createTimer
// attach a fresh project mural without the tracker depending on murales.
type MuralFactory = (title: string) => Promise<{ id: string }>
let muralFactory: MuralFactory | null = null
export function setMuralFactory(fn: MuralFactory | null): void {
  muralFactory = fn
}

function byTitle(a: YTimerDef, b: YTimerDef): number {
  return a.title.localeCompare(b.title)
}

function byStartDesc(a: YTimeEntry, b: YTimeEntry): number {
  return b.start.iso.localeCompare(a.start.iso)
}

interface CreateTimerOpts {
  // Attach a fresh mural via the injected factory. Default true when a factory
  // is present and no muralId was given.
  withMural?: boolean
}

interface TrackerState {
  timers: YTimerDef[]
  entries: YTimeEntry[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  createTimer: (partial?: Partial<YTimerDef>, opts?: CreateTimerOpts) => Promise<YTimerDef>
  updateTimer: (id: string, patch: Partial<YTimerDef>) => Promise<void>
  removeTimer: (id: string) => Promise<void>
  /** Open a new entry for a timer. No-op if one is already running for it. */
  start: (timerId: string) => Promise<void>
  /** Close the timer's open entry, if any. */
  stop: (timerId: string) => Promise<void>
  updateEntry: (id: string, patch: Partial<YTimeEntry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  moveTimer: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(PREFS_KEY)

export const useTracker = create<TrackerState>((set, get) => ({
  timers: [],
  entries: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const [timers, entries] = await Promise.all([
      listMerged<YTimerDef>(TIMERS_COLLECTION, get().activeSpaces),
      listMerged<YTimeEntry>(ENTRIES_COLLECTION, get().activeSpaces),
    ])
    timers.sort(byTitle)
    entries.sort(byStartDesc)
    set({ timers, entries, loaded: true })
  },

  async createTimer(partial, opts) {
    const space = spaceFor<YTimerDef>(TIMERS_COLLECTION, undefined, get().defaultSpace)
    const title = partial?.title?.trim() || 'Nuevo cronómetro'
    let muralId = partial?.muralId
    if (!muralId && opts?.withMural !== false && muralFactory) {
      try {
        muralId = (await muralFactory(title)).id
      } catch {
        // A failed mural attach never blocks creating the timer (local-first).
      }
    }
    const timer: YTimerDef = {
      id: partial?.id ?? uid('tmr'),
      title,
      emoji: partial?.emoji ?? randomTimerEmoji(),
      color: partial?.color,
      muralId,
      updatedAt: new Date().toISOString(),
    }
    if (!space) return timer
    const created = await space.create(timer)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ timers: [...s.timers, created].sort(byTitle) }))
    }
    return created
  },

  async updateTimer(id, patch) {
    const existing = get().timers.find((t) => t.id === id)
    if (!existing) return
    const space = spaceFor(TIMERS_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, { ...patch, updatedAt: new Date().toISOString() })
    if (!next) return
    set((s) => ({ timers: s.timers.map((t) => (t.id === id ? next : t)).sort(byTitle) }))
  },

  async removeTimer(id) {
    const existing = get().timers.find((t) => t.id === id)
    const space = spaceFor(TIMERS_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    // Close a running entry first so no orphan span keeps growing forever.
    await get().stop(id)
    await space.remove(id)
    set((s) => ({ timers: s.timers.filter((t) => t.id !== id) }))
  },

  async start(timerId) {
    if (runningEntry(get().entries, timerId)) return
    const space = spaceFor<YTimeEntry>(ENTRIES_COLLECTION, undefined, get().defaultSpace)
    if (!space) return
    const entry: YTimeEntry = {
      id: uid('ent'),
      timerId,
      start: toDateTime(new Date()),
      updatedAt: new Date().toISOString(),
    }
    const created = await space.create(entry)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ entries: [created, ...s.entries].sort(byStartDesc) }))
    }
  },

  async stop(timerId) {
    const open = runningEntry(get().entries, timerId)
    if (!open) return
    await get().updateEntry(open.id, { end: toDateTime(new Date()) })
  },

  async updateEntry(id, patch) {
    const existing = get().entries.find((e) => e.id === id)
    if (!existing) return
    const space = spaceFor(ENTRIES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, { ...patch, updatedAt: new Date().toISOString() })
    if (!next) return
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)).sort(byStartDesc) }))
  },

  async removeEntry(id) {
    const existing = get().entries.find((e) => e.id === id)
    const space = spaceFor(ENTRIES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },

  async moveTimer(id, toSpace) {
    const existing = get().timers.find((t) => t.id === id)
    if (!existing) return
    const created = await moveItem(TIMERS_COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({ timers: s.timers.map((t) => (t.id === id ? created : t)) }))
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

// Re-export the running-state helper for views.
export { isRunning }
