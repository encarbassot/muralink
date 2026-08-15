// Pure conversion between our YCalendarEvent and Google's event shape. No I/O,
// so it is unit-testable in isolation. Two tricky bits are handled here:
//   • Recurrence — Google wants an `RRULE:` line and UNTIL in RFC 5545 basic
//     UTC (20260801T235959Z); we store the bare rule with an ISO UNTIL.
//   • Mural-only data — checklist blocks and colour have no Google field, so
//     they ride in extendedProperties.private and round-trip untouched.

import type { YBlock } from '@muralink/types'
import type { YCalendarEvent } from '../../../types.ts'
import { formatRRule, parseRRule } from '../../../recurrence.ts'
import type { GoogleEvent } from './client.ts'

const BLOCKS_KEY = 'muralBlocks'
const COLOR_KEY = 'muralColor'

// ── Recurrence <-> Google ────────────────────────────────────────────────────

function isoToBasicUtc(iso: string): string {
  // '2026-08-01T23:59:59.000Z' -> '20260801T235959Z'
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Google's basic UTC ('20260801T235959Z') or a plain ISO string -> ISO. JS
// Date can't parse the basic form, so expand it first.
function untilToIso(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value)
  if (m) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = m
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString()
  }
  return new Date(value).toISOString()
}

// Our stored rrule (ISO UNTIL) -> a Google `recurrence` array, or undefined.
export function rruleToGoogle(rrule: string | undefined): string[] | undefined {
  const rule = parseRRule(rrule)
  if (!rule) return undefined
  const google = rule.until ? { ...rule, until: isoToBasicUtc(rule.until) } : rule
  return [`RRULE:${formatRRule(google)}`]
}

// Google `recurrence` array -> our stored rrule string (ISO UNTIL), or
// undefined. Only RRULE is supported; EXDATE/RDATE lines are ignored (MVP).
export function rruleFromGoogle(recurrence: string[] | undefined): string | undefined {
  if (!recurrence) return undefined
  const line = recurrence.find((r) => r.startsWith('RRULE:'))
  if (!line) return undefined
  const rule = parseRRule(line.slice('RRULE:'.length)) // parseRRule accepts basic UNTIL
  if (!rule) return undefined
  const normalized = rule.until ? { ...rule, until: untilToIso(rule.until) } : rule
  return formatRRule(normalized)
}

// ── Event <-> Google ─────────────────────────────────────────────────────────

export function toGoogle(event: YCalendarEvent): Partial<GoogleEvent> {
  const priv: Record<string, string> = {}
  if (event.blocks?.length) priv[BLOCKS_KEY] = JSON.stringify(event.blocks)
  if (event.metadata?.['color']) priv[COLOR_KEY] = event.metadata['color']

  const g: Partial<GoogleEvent> = {
    summary: event.title,
    recurrence: rruleToGoogle(event.rrule),
    extendedProperties: Object.keys(priv).length ? { private: priv } : undefined,
  }

  if (event.allDay) {
    // Google all-day uses date-only with an EXCLUSIVE end date.
    const startDate = event.start.iso.slice(0, 10)
    const end = new Date(event.end.iso)
    end.setDate(end.getDate() + 1)
    g.start = { date: startDate }
    g.end = { date: end.toISOString().slice(0, 10) }
  } else {
    g.start = { dateTime: event.start.iso, timeZone: event.start.timezone }
    g.end = { dateTime: event.end.iso, timeZone: event.end.timezone }
  }
  return g
}

export interface MappedEvent {
  title: string
  start: { iso: string; timezone: string }
  end: { iso: string; timezone: string }
  allDay: boolean
  rrule?: string
  blocks?: YBlock[]
  metadata?: Record<string, string>
}

export function fromGoogle(g: GoogleEvent): MappedEvent {
  const priv = g.extendedProperties?.private ?? {}
  let blocks: YBlock[] | undefined
  if (priv[BLOCKS_KEY]) {
    try {
      blocks = JSON.parse(priv[BLOCKS_KEY]) as YBlock[]
    } catch {
      blocks = undefined
    }
  }
  const metadata = priv[COLOR_KEY] ? { color: priv[COLOR_KEY] } : undefined

  const allDay = Boolean(g.start?.date)
  let start: { iso: string; timezone: string }
  let end: { iso: string; timezone: string }
  if (allDay) {
    const tz = g.start?.timeZone ?? 'UTC'
    const startDate = g.start!.date!
    // Exclusive end date back to an inclusive 23:59 on the previous day.
    const endExclusive = new Date(`${g.end?.date ?? startDate}T00:00:00.000Z`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() - 1)
    start = { iso: `${startDate}T00:00:00.000Z`, timezone: tz }
    end = { iso: `${endExclusive.toISOString().slice(0, 10)}T23:59:00.000Z`, timezone: tz }
  } else {
    start = { iso: new Date(g.start!.dateTime!).toISOString(), timezone: g.start?.timeZone ?? 'UTC' }
    end = { iso: new Date(g.end!.dateTime!).toISOString(), timezone: g.end?.timeZone ?? 'UTC' }
  }

  return {
    title: g.summary ?? '(sin título)',
    start,
    end,
    allDay,
    rrule: rruleFromGoogle(g.recurrence),
    blocks,
    metadata,
  }
}
