// Local-first attendance persistence over storage spaces, mirroring tracker's
// multi-collection store. Three collections share one space choice:
// 'attendance-calendar-types', 'attendance-entries', 'attendance-vacation-requests'
// — a calendar type and its entries live in the same place.
//
// clock-in/out and vacation approve/reject are NOT plain CRUD: the server
// derives the actor from req.access.userId (never the body) and, for
// approve, runs a transaction that also writes an attendance_entries row (see
// implementations/server/routes.ts). Those go through a thin fetch
// side-channel configured by the host via configureAttendanceApi — exactly
// like tracker's setMuralFactory. With no host config there is no server
// actor to attribute to, so clock-in/out and vacation actions simply throw;
// plain CRUD (createEntry, updateEntry…) keeps working fully offline.

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
import type { YCalendarType, YAttendanceEntry, YVacationRequest } from '../../types.ts'

export const CALENDAR_TYPES_COLLECTION = 'attendance-calendar-types'
export const ENTRIES_COLLECTION = 'attendance-entries'
export const VACATION_REQUESTS_COLLECTION = 'attendance-vacation-requests'
// One prefs key for all three collections — they travel together.
const PREFS_KEY = 'attendance'

// The default spaces are always available.
registerSpace(
  CALENDAR_TYPES_COLLECTION,
  makeIdbSpace<YCalendarType>({ dbName: 'elio-attendance', store: 'calendarTypes' }),
)
registerSpace(
  ENTRIES_COLLECTION,
  makeIdbSpace<YAttendanceEntry>({ dbName: 'elio-attendance', store: 'entries' }),
)
registerSpace(
  VACATION_REQUESTS_COLLECTION,
  makeIdbSpace<YVacationRequest>({ dbName: 'elio-attendance', store: 'vacationRequests' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface ApiConfig {
  baseUrl: string
  token: string
  userId: string
}

let apiConfig: ApiConfig | null = null

/** Host-injected server config for the non-CRUD attendance actions (clock
 *  in/out, vacation request/approve/reject). Pass null to go back offline-only. */
export function configureAttendanceApi(cfg: ApiConfig | null): void {
  apiConfig = cfg
}

async function apiPost<R>(path: string, body?: unknown): Promise<R> {
  if (!apiConfig) throw new Error('attendance API not configured — call configureAttendanceApi() first')
  const res = await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/api/attendance${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.token}`,
      'X-Mural-User': apiConfig.userId,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`attendance API ${path} ${res.status}`)
  return (await res.json()) as R
}

function byStart(a: YAttendanceEntry, b: YAttendanceEntry): number {
  const aKey = a.planned?.start.iso ?? a.recorded?.start.iso ?? ''
  const bKey = b.planned?.start.iso ?? b.recorded?.start.iso ?? ''
  return aKey.localeCompare(bKey)
}

function byCreatedDesc(a: YVacationRequest, b: YVacationRequest): number {
  return b.createdAt.iso.localeCompare(a.createdAt.iso)
}

interface AttendanceState {
  calendarTypes: YCalendarType[]
  entries: YAttendanceEntry[]
  vacationRequests: YVacationRequest[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId

  loadAll: () => Promise<void>

  createCalendarType: (
    partial: Partial<YCalendarType> & { name: string; kind: YCalendarType['kind'] },
  ) => Promise<YCalendarType>
  updateCalendarType: (id: string, patch: Partial<YCalendarType>) => Promise<void>
  removeCalendarType: (id: string) => Promise<void>

  createEntry: (
    partial: Partial<YAttendanceEntry> & { employeeId: string; calendarTypeId: string },
  ) => Promise<YAttendanceEntry>
  updateEntry: (id: string, patch: Partial<YAttendanceEntry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  /** Self clock-in via the server, attributed to the configured user. */
  clockIn: (opts?: { calendarTypeId?: string; note?: string }) => Promise<YAttendanceEntry>
  /** Close the caller's own open clock-in, if any. */
  clockOut: () => Promise<YAttendanceEntry>

  requestVacation: (req: Pick<YVacationRequest, 'kind' | 'start' | 'end' | 'reason'>) => Promise<YVacationRequest>
  approveVacation: (id: string, decisionNote?: string) => Promise<YVacationRequest>
  rejectVacation: (id: string, decisionNote?: string) => Promise<YVacationRequest>

  moveEntry: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(PREFS_KEY)

export const useAttendance = create<AttendanceState>((set, get) => ({
  calendarTypes: [],
  entries: [],
  vacationRequests: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const [calendarTypes, entries, vacationRequests] = await Promise.all([
      listMerged<YCalendarType>(CALENDAR_TYPES_COLLECTION, get().activeSpaces),
      listMerged<YAttendanceEntry>(ENTRIES_COLLECTION, get().activeSpaces),
      listMerged<YVacationRequest>(VACATION_REQUESTS_COLLECTION, get().activeSpaces),
    ])
    entries.sort(byStart)
    vacationRequests.sort(byCreatedDesc)
    set({ calendarTypes, entries, vacationRequests, loaded: true })
  },

  async createCalendarType(partial) {
    const space = spaceFor<YCalendarType>(CALENDAR_TYPES_COLLECTION, undefined, get().defaultSpace)
    const type: YCalendarType = {
      id: partial.id ?? uid('catype'),
      employeeId: partial.employeeId,
      name: partial.name,
      kind: partial.kind,
      color: partial.color,
      externalProvider: partial.externalProvider,
      externalCalendarId: partial.externalCalendarId,
      syncEnabled: partial.syncEnabled ?? false,
      createdAt: partial.createdAt ?? { iso: new Date().toISOString(), timezone: 'UTC' },
    }
    if (!space) return type
    const created = await space.create(type)
    // YCalendarType (types.ts, copied verbatim from the plan) has no
    // `spaceId` field, unlike YAttendanceEntry — spaces still stamp it on
    // create/list at runtime (StorageSpace<T>'s contract), so read it
    // structurally rather than widening the type.
    const createdSpaceId = (created as { spaceId?: string }).spaceId
    if (createdSpaceId && get().activeSpaces.includes(createdSpaceId)) {
      set((s) => ({ calendarTypes: [...s.calendarTypes, created] }))
    }
    return created
  },

  async updateCalendarType(id, patch) {
    const existing = get().calendarTypes.find((t) => t.id === id)
    if (!existing) return
    const space = spaceFor(CALENDAR_TYPES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, patch)
    if (!next) return
    set((s) => ({ calendarTypes: s.calendarTypes.map((t) => (t.id === id ? next : t)) }))
  },

  async removeCalendarType(id) {
    const existing = get().calendarTypes.find((t) => t.id === id)
    const space = spaceFor(CALENDAR_TYPES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ calendarTypes: s.calendarTypes.filter((t) => t.id !== id) }))
  },

  async createEntry(partial) {
    const space = spaceFor<YAttendanceEntry>(ENTRIES_COLLECTION, undefined, get().defaultSpace)
    const entry: YAttendanceEntry = {
      id: partial.id ?? uid('att'),
      employeeId: partial.employeeId,
      calendarTypeId: partial.calendarTypeId,
      planned: partial.planned,
      recorded: partial.recorded,
      vacationRequestId: partial.vacationRequestId,
      note: partial.note,
      createdBy: partial.createdBy ?? partial.employeeId,
      updatedAt: partial.updatedAt ?? new Date().toISOString(),
    }
    if (!space) return entry
    const created = await space.create(entry)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ entries: [...s.entries, created].sort(byStart) }))
    }
    return created
  },

  async updateEntry(id, patch) {
    const existing = get().entries.find((e) => e.id === id)
    if (!existing) return
    const space = spaceFor(ENTRIES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, { ...patch, updatedAt: new Date().toISOString() })
    if (!next) return
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)).sort(byStart) }))
  },

  async removeEntry(id) {
    const existing = get().entries.find((e) => e.id === id)
    const space = spaceFor(ENTRIES_COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },

  async clockIn(opts) {
    const entry = await apiPost<YAttendanceEntry>('/entries/clock-in', opts ?? {})
    set((s) => ({ entries: [...s.entries.filter((e) => e.id !== entry.id), entry].sort(byStart) }))
    return entry
  },

  async clockOut() {
    const entry = await apiPost<YAttendanceEntry>('/entries/clock-out')
    set((s) => ({ entries: s.entries.map((e) => (e.id === entry.id ? entry : e)) }))
    return entry
  },

  async requestVacation(req) {
    const created = await apiPost<YVacationRequest>('/vacation-requests', req)
    set((s) => ({ vacationRequests: [created, ...s.vacationRequests] }))
    return created
  },

  async approveVacation(id, decisionNote) {
    const result = await apiPost<{ request: YVacationRequest; entry: YAttendanceEntry }>(
      `/vacation-requests/${id}/approve`,
      { decisionNote },
    )
    set((s) => ({
      vacationRequests: s.vacationRequests.map((r) => (r.id === id ? result.request : r)),
      entries: [...s.entries, result.entry].sort(byStart),
    }))
    return result.request
  },

  async rejectVacation(id, decisionNote) {
    const rejected = await apiPost<YVacationRequest>(`/vacation-requests/${id}/reject`, { decisionNote })
    set((s) => ({ vacationRequests: s.vacationRequests.map((r) => (r.id === id ? rejected : r)) }))
    return rejected
  },

  async moveEntry(id, toSpace) {
    const existing = get().entries.find((e) => e.id === id)
    if (!existing) return
    const created = await moveItem(ENTRIES_COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? created : e)) }))
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
