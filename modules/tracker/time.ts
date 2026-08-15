// Pure time math for the tracker module. Dependency-free (like the calendar's
// recurrence.ts) so web, server and checks can all import it.

import type { YDateTime } from '@muralink/types'
import type { YTimeEntry, YTimerDef } from './types.ts'

// A calendar-shaped projection of a time entry. Structurally assignable to the
// calendar module's YCalendarEvent without importing it — keeps tracker a leaf.
export interface TrackerCalendarEvent {
  id: string
  title: string
  start: YDateTime
  end: YDateTime
  duration: { seconds: number }
  allDay: boolean
  metadata?: Record<string, string>
  updatedAt?: string
  spaceId?: string
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export function toDateTime(d: Date): YDateTime {
  return { iso: d.toISOString(), timezone: TZ }
}

export function isRunning(entry: YTimeEntry): boolean {
  return !entry.end
}

/** Effective end of an entry in ms — open entries clamp to `now`. */
export function entryEndMs(entry: YTimeEntry, nowMs: number): number {
  return entry.end ? new Date(entry.end.iso).getTime() : nowMs
}

export function elapsedMs(entry: YTimeEntry, nowMs: number): number {
  return Math.max(0, entryEndMs(entry, nowMs) - new Date(entry.start.iso).getTime())
}

/** The entry currently running for a timer, if any. */
export function runningEntry(entries: YTimeEntry[], timerId: string): YTimeEntry | undefined {
  return entries.find((e) => e.timerId === timerId && isRunning(e))
}

/** Total tracked ms for a timer within the local calendar day of `now`. */
export function totalTodayMs(entries: YTimeEntry[], timerId: string, now: Date): number {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayEnd = dayStart + 24 * 3600 * 1000
  const nowMs = now.getTime()
  let total = 0
  for (const e of entries) {
    if (e.timerId !== timerId) continue
    const s = new Date(e.start.iso).getTime()
    const end = entryEndMs(e, nowMs)
    total += Math.max(0, Math.min(end, dayEnd) - Math.max(s, dayStart))
  }
  return total
}

/** Calendar-style overlap: starts before `to` and (effectively) ends after `from`. */
export function overlapsRange(entry: YTimeEntry, fromIso: string | undefined, toIso: string | undefined, nowMs: number): boolean {
  const startIso = entry.start.iso
  const endIso = new Date(entryEndMs(entry, nowMs)).toISOString()
  if (toIso && startIso >= toIso) return false
  if (fromIso && endIso <= fromIso) return false
  return true
}

/** hh:mm:ss (or mm:ss under an hour) for a live elapsed readout. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Project an entry into a calendar event. Open entries clamp their end to
 * `now`. The id uses a `trk-` prefix — NEVER `::`, which the calendar's
 * recurrence layer would parse as an occurrence separator.
 */
export function entryToEvent(entry: YTimeEntry, timer: YTimerDef | undefined, now: Date): TrackerCalendarEvent {
  const nowMs = now.getTime()
  const endIso = new Date(entryEndMs(entry, nowMs)).toISOString()
  const seconds = Math.round(elapsedMs(entry, nowMs) / 1000)
  const metadata: Record<string, string> = { source: 'tracker', timerId: entry.timerId }
  if (timer?.color) metadata['color'] = timer.color
  return {
    id: `trk-${entry.id}`,
    title: `${timer?.emoji ?? '⏱️'} ${timer?.title ?? 'Cronómetro'}`,
    start: entry.start,
    end: { iso: endIso, timezone: entry.start.timezone },
    duration: { seconds },
    allDay: false,
    metadata,
    updatedAt: entry.updatedAt,
  }
}
