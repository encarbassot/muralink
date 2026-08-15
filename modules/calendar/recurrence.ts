// Recurrence engine — RFC 5545 RRULE subset, expanded virtually at read time.
// Pure and dependency-free so both web and server implementations can import
// it, exactly like types.ts. Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY,
// INTERVAL, UNTIL, COUNT. Anything else in the string → parseRRule returns
// null and the event behaves as non-recurring (never throws).

import type { YCalendarEvent } from './types.ts'

export interface RRuleLite {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number // >= 1
  until?: string // ISO instant, inclusive (occurrence start <= until)
  count?: number // total occurrences including the base one
}

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const

// Occurrence ids are `${baseId}::${occStartIso}`. Base ids never contain '::'
// (store uids are `ev-…`, server ids are UUIDs), so splitting is safe.
export const OCC_SEP = '::'

export function baseIdOf(id: string): string {
  const at = id.indexOf(OCC_SEP)
  return at === -1 ? id : id.slice(0, at)
}

export function isOccurrenceId(id: string): boolean {
  return id.includes(OCC_SEP)
}

/** Accepts both ISO instants and RFC 5545 basic format (20260801T120000Z). */
function toInstant(value: string): number {
  const basic = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value)
  if (basic) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = basic
    return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
  }
  return Date.parse(value)
}

export function parseRRule(s: string | undefined): RRuleLite | null {
  if (!s) return null
  let freq: RRuleLite['freq'] | undefined
  let interval = 1
  let until: string | undefined
  let count: number | undefined
  for (const part of s.split(';')) {
    if (!part.trim()) continue
    const eq = part.indexOf('=')
    if (eq === -1) return null
    const key = part.slice(0, eq).trim().toUpperCase()
    const value = part.slice(eq + 1).trim()
    if (key === 'FREQ') {
      if (!(FREQS as readonly string[]).includes(value.toUpperCase())) return null
      freq = value.toUpperCase() as RRuleLite['freq']
    } else if (key === 'INTERVAL') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return null
      interval = n
    } else if (key === 'UNTIL') {
      if (Number.isNaN(toInstant(value))) return null
      until = value
    } else if (key === 'COUNT') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return null
      count = n
    } else {
      // BYDAY, BYMONTH… — unsupported; treat the whole rule as opaque.
      return null
    }
  }
  return freq ? { freq, interval, until, count } : null
}

export function formatRRule(r: RRuleLite): string {
  let out = `FREQ=${r.freq}`
  if (r.interval > 1) out += `;INTERVAL=${r.interval}`
  if (r.until) out += `;UNTIL=${r.until}`
  if (r.count) out += `;COUNT=${r.count}`
  return out
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Candidate occurrence start for iteration step i, using local-calendar
// arithmetic so wall-clock time survives DST (never add fixed milliseconds).
// Returns null for months/years that lack the base day (Jan 31 → no Feb 31;
// RFC behavior is to skip, and skipped dates do not consume COUNT).
function occurrenceStart(base: Date, rule: RRuleLite, i: number): Date | null {
  const d = new Date(base)
  switch (rule.freq) {
    case 'DAILY':
      d.setDate(base.getDate() + i * rule.interval)
      return d
    case 'WEEKLY':
      d.setDate(base.getDate() + i * 7 * rule.interval)
      return d
    case 'MONTHLY': {
      const months = base.getMonth() + i * rule.interval
      const year = base.getFullYear() + Math.floor(months / 12)
      const month = ((months % 12) + 12) % 12
      if (base.getDate() > daysInMonth(year, month)) return null
      d.setFullYear(year, month, base.getDate())
      return d
    }
    case 'YEARLY': {
      const year = base.getFullYear() + i * rule.interval
      if (base.getDate() > daysInMonth(year, base.getMonth())) return null
      d.setFullYear(year, base.getMonth(), base.getDate())
      return d
    }
  }
}

// Runaway guard, not a semantic limit — generous enough for years of daily
// occurrences while still bounding a corrupt rule.
const MAX_ITERATIONS = 5000

/**
 * Expand recurring events into virtual occurrences overlapping [from, to).
 * Non-recurring events (and events with unsupported rrules) pass through
 * unchanged. The base event's own slot is emitted with its real id; later
 * occurrences get `${id}::${occStartIso}` and share the base's `blocks`
 * reference — ticking a checkbox on any occurrence ticks it everywhere.
 */
export function expandEvents(
  events: YCalendarEvent[],
  from: Date,
  to: Date,
): YCalendarEvent[] {
  const out: YCalendarEvent[] = []
  for (const event of events) {
    const rule = parseRRule(event.rrule)
    if (!rule) {
      out.push(event)
      continue
    }
    const base = new Date(event.start.iso)
    const durMs = new Date(event.end.iso).getTime() - base.getTime()
    const untilMs = rule.until ? toInstant(rule.until) : Infinity
    let emitted = 0
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const occStart = occurrenceStart(base, rule, i)
      if (!occStart) continue
      if (occStart.getTime() > untilMs) break
      if (rule.count !== undefined && emitted >= rule.count) break
      emitted++
      if (occStart >= to) break
      const occEnd = new Date(occStart.getTime() + durMs)
      if (occEnd <= from) continue
      if (i === 0) {
        out.push(event)
        continue
      }
      out.push({
        ...event,
        id: `${event.id}${OCC_SEP}${occStart.toISOString()}`,
        start: { iso: occStart.toISOString(), timezone: event.start.timezone },
        end: { iso: occEnd.toISOString(), timezone: event.end.timezone },
      })
    }
  }
  return out
}
