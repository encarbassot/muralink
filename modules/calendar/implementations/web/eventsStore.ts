// Unified calendar store over N storage spaces. Reads from every *active*
// space and merges; writes go to a single chosen space and each event
// remembers which space holds it (spaceId), so later edits/deletes route back
// correctly. Default config is local-only (offline). The host can register an
// `api` space and the user enables it — that is what syncs every frontend.
// Space mechanics live in @muralink/spaces; this store keeps the calendar's
// range-based load and its original public shape.

import { create } from 'zustand'
import {
  loadPrefs,
  persistPrefs,
  withDefault,
  withToggled,
  listMerged,
  spaceFor,
  moveItem,
} from '@muralink/spaces'
import type { YCalendarEvent } from '../../types.ts'
import {
  COLLECTION,
  type StoreId,
  registerProvider,
  getProvider,
} from './storage/provider.ts'
import { localProvider } from './storage/localProvider.ts'

// The default space is always available.
registerProvider(localProvider)

export {
  registerProvider,
  listProviders,
  type StorageProvider,
  type StoreId,
} from './storage/provider.ts'
export { makeApiProvider } from './storage/apiProvider.ts'

function uid(): string {
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

interface MakeOpts {
  title?: string
  color?: string
  allDay?: boolean
  createdBy?: string // user id for shared calendars
}

export function makeEvent(start: Date, end: Date, opts: MakeOpts = {}): YCalendarEvent {
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
  const metadata: Record<string, string> = {}
  if (opts.color) metadata['color'] = opts.color
  if (opts.createdBy) metadata['createdBy'] = opts.createdBy
  return {
    id: uid(),
    title: opts.title ?? 'Nuevo evento',
    start: { iso: start.toISOString(), timezone: TZ },
    end: { iso: end.toISOString(), timezone: TZ },
    duration: { seconds },
    allDay: opts.allDay ?? false,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  }
}

interface AddOpts extends MakeOpts {
  target?: StoreId // overrides defaultTarget for this event
}

interface EventsState {
  events: YCalendarEvent[]
  activeTargets: StoreId[]
  defaultTarget: StoreId
  loaded: boolean
  range: { from: string; to: string } | null

  load: (from: Date, to: Date) => Promise<void>
  reload: () => Promise<void>
  add: (start: Date, end: Date, opts?: AddOpts) => Promise<YCalendarEvent | null>
  update: (id: string, patch: Partial<YCalendarEvent>) => Promise<void>
  remove: (id: string) => Promise<void>
  moveEvent: (id: string, toTarget: StoreId) => Promise<void>

  setDefaultTarget: (id: StoreId) => void
  toggleTarget: (id: StoreId) => void
}

function byStart(a: YCalendarEvent, b: YCalendarEvent): number {
  return a.start.iso.localeCompare(b.start.iso)
}

const prefs = loadPrefs(COLLECTION)

export const useEvents = create<EventsState>((set, get) => ({
  events: [],
  activeTargets: prefs.activeSpaces,
  defaultTarget: prefs.defaultSpace,
  loaded: false,
  range: null,

  async load(from, to) {
    const range = { from: from.toISOString(), to: to.toISOString() }
    // One failing space (e.g. api offline) must not blank the calendar —
    // listMerged isolates per-space failures.
    const merged = await listMerged<YCalendarEvent>(COLLECTION, get().activeTargets, range)
    merged.sort(byStart)
    set({ events: merged, loaded: true, range })
  },

  async reload() {
    const r = get().range
    if (r) await get().load(new Date(r.from), new Date(r.to))
  },

  async add(start, end, opts = {}) {
    const provider = getProvider(opts.target ?? get().defaultTarget)
    if (!provider) return null
    const ev = makeEvent(start, end, opts)
    const created = await provider.create(ev)
    // Only surface it if its space is currently visible.
    if (get().activeTargets.includes(created.spaceId!)) {
      set((s) => ({ events: [...s.events, created].sort(byStart) }))
    }
    return created
  },

  async update(id, patch) {
    const existing = get().events.find((e) => e.id === id)
    const provider = spaceFor(COLLECTION, existing, get().defaultTarget)
    if (!provider) return
    const next = await provider.update(id, patch)
    if (!next) return
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? next : e)).sort(byStart),
    }))
  },

  async remove(id) {
    const existing = get().events.find((e) => e.id === id)
    const provider = spaceFor(COLLECTION, existing, get().defaultTarget)
    if (!provider) return
    await provider.remove(id)
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }))
  },

  // Move an event between spaces: recreate it in the destination, drop the
  // original. Server-backed spaces mint a new id, so we swap the record.
  async moveEvent(id, toTarget) {
    const existing = get().events.find((e) => e.id === id)
    if (!existing) return
    const created = await moveItem(COLLECTION, existing, toTarget)
    if (!created) return
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? created : e)),
    }))
  },

  setDefaultTarget(id) {
    set((s) => {
      const next = withDefault({ activeSpaces: s.activeTargets, defaultSpace: s.defaultTarget }, id)
      persistPrefs(COLLECTION, next)
      return { activeTargets: next.activeSpaces, defaultTarget: next.defaultSpace }
    })
    void get().reload()
  },

  toggleTarget(id) {
    set((s) => {
      const next = withToggled({ activeSpaces: s.activeTargets, defaultSpace: s.defaultTarget }, id)
      persistPrefs(COLLECTION, next)
      return { activeTargets: next.activeSpaces, defaultTarget: next.defaultSpace }
    })
    void get().reload()
  },
}))
