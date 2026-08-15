// Pure time-grid helpers shared by the day/week column renderers. Extracted
// from DayColumn so WeekViewMobile can compose the same math: minute-of-day
// spans clamped per day, pointer→minute snapping, and lane packing.

import type { YCalendarEvent } from '../../../types.ts'

export const SNAP = 15 // minutes
export const DEFAULT_COLOR = 'var(--accent, #b5936a)'

// A focused block grows by this many px on each axis (real size, not a
// transform) so its font-size, padding and border-radius stay put.
export const ZOOM_PAD = { x: 30, y: 20 }

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

// Minute-of-day from a pointer position, scaled to the column's real height.
export function minuteFromPointer(clientY: number, rect: DOMRect): number {
  const frac = (clientY - rect.top) / rect.height
  return clamp(Math.round((frac * 1440) / SNAP) * SNAP, 0, 1440)
}

export function atMinute(day: Date, minute: number): Date {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(minute)
  return d
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function colorOf(e: YCalendarEvent): string {
  return e.metadata?.['color'] || DEFAULT_COLOR
}

// Minute-of-day span of a timed event, clamped to [0, 1440] for this day.
// Multi-day events resolve naturally: the start day gets startMin→1440,
// middle days 0→1440, the end day 0→endMin.
export function spanFor(e: YCalendarEvent, day: Date): { top: number; bot: number } {
  const s = new Date(e.start.iso)
  const en = new Date(e.end.iso)
  const dayStart = atMinute(day, 0).getTime()
  const top = clamp((s.getTime() - dayStart) / 60000, 0, 1440)
  const bot = clamp((en.getTime() - dayStart) / 60000, 0, 1440)
  return { top, bot: Math.max(bot, top + SNAP) }
}

// Pack overlapping timed events into side-by-side lanes so none fully hide.
export function assignLanes(events: YCalendarEvent[], day: Date): Map<string, { lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start.iso.localeCompare(b.start.iso))
  const out = new Map<string, { lane: number; lanes: number }>()
  let cluster: YCalendarEvent[] = []
  let clusterEnd = -1

  const flush = () => {
    const laneEnds: number[] = []
    const laneOf = new Map<string, number>()
    for (const e of cluster) {
      const { top, bot } = spanFor(e, day)
      let lane = laneEnds.findIndex((end) => end <= top)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(bot) } else laneEnds[lane] = bot
      laneOf.set(e.id, lane)
    }
    const lanes = laneEnds.length
    for (const e of cluster) out.set(e.id, { lane: laneOf.get(e.id)!, lanes })
    cluster = []
    clusterEnd = -1
  }

  for (const e of sorted) {
    const { top, bot } = spanFor(e, day)
    if (cluster.length && top >= clusterEnd) flush()
    cluster.push(e)
    clusterEnd = Math.max(clusterEnd, bot)
  }
  if (cluster.length) flush()
  return out
}

export function pct(min: number): string {
  return `${(min / 1440) * 100}%`
}

export function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
