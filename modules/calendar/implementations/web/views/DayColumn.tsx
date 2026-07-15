// Mobile-first single-day column. The whole 24h fits the viewport — top edge is
// 00:00, bottom edge is 23:59 — so there is no scroll fighting the drag gesture.
// Press (pointer down) starts a task, release ends it → onCreate(start, end).
// All-day events paint their whole day column in their colour (not a header
// banner). Pointer Events cover mouse + touch from one code path.

import { useEffect, useRef, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'

const SNAP = 15 // minutes
const DEFAULT_COLOR = 'var(--accent, #b5936a)'

interface Props {
  day: Date
  events?: YCalendarEvent[]
  onCreate?: (start: Date, end: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

// Minute-of-day from a pointer position, scaled to the column's real height.
function minuteFromPointer(clientY: number, rect: DOMRect): number {
  const frac = (clientY - rect.top) / rect.height
  return clamp(Math.round((frac * 1440) / SNAP) * SNAP, 0, 1440)
}

function atMinute(day: Date, minute: number): Date {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(minute)
  return d
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function colorOf(e: YCalendarEvent): string {
  return e.metadata?.['color'] || DEFAULT_COLOR
}

// Minute-of-day span of a timed event, clamped to [0, 1440] for this day.
function spanFor(e: YCalendarEvent, day: Date): { top: number; bot: number } {
  const s = new Date(e.start.iso)
  const en = new Date(e.end.iso)
  const dayStart = atMinute(day, 0).getTime()
  const top = clamp((s.getTime() - dayStart) / 60000, 0, 1440)
  const bot = clamp((en.getTime() - dayStart) / 60000, 0, 1440)
  return { top, bot: Math.max(bot, top + SNAP) }
}

// Pack overlapping timed events into side-by-side lanes so none fully hide.
function assignLanes(events: YCalendarEvent[], day: Date): Map<string, { lane: number; lanes: number }> {
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

interface Draft { aMin: number; bMin: number }

export function DayColumn({ day, events = [], onCreate, onEventClick }: Props) {
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)
  const lanes = assignLanes(timed, day)
  const interactive = !!onCreate

  const [draft, setDraft] = useState<Draft | null>(null)
  const drag = useRef<{ rect: DOMRect; aMin: number } | null>(null)

  useEffect(() => {
    if (!draft) return
    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      setDraft({ aMin: d.aMin, bMin: minuteFromPointer(e.clientY, d.rect) })
    }
    function onUp(e: PointerEvent) {
      const d = drag.current
      if (d && onCreate) {
        const b = minuteFromPointer(e.clientY, d.rect)
        let lo = Math.min(d.aMin, b)
        let hi = Math.max(d.aMin, b)
        if (hi - lo < SNAP) hi = Math.min(lo + 60, 1440) // tap → default 1h block
        onCreate(atMinute(day, lo), atMinute(day, hi))
      }
      drag.current = null
      setDraft(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draft, onCreate, day])

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const m = minuteFromPointer(e.clientY, rect)
    drag.current = { rect, aMin: m }
    setDraft({ aMin: m, bMin: m })
  }

  const now = new Date()
  const nowFrac = sameDay(day, now) ? (now.getHours() * 60 + now.getMinutes()) / 1440 : null
  const pct = (min: number) => `${(min / 1440) * 100}%`

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, position: 'relative', fontFamily: 'inherit' }}>
      {/* Hour rail */}
      <div style={{ width: 42, flexShrink: 0, position: 'relative', borderRight: '1px solid var(--border, #d4cfc9)' }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: pct(h * 60),
              right: 6,
              transform: h === 0 ? 'translateY(0)' : 'translateY(-50%)',
              fontSize: 10,
              color: 'var(--muted-foreground, #6b6560)',
              lineHeight: 1,
            }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Day column */}
      <div
        onPointerDown={startDrag}
        style={{
          flex: 1,
          position: 'relative',
          cursor: interactive ? 'crosshair' : 'default',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Hour grid lines */}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: pct(h * 60),
              left: 0,
              right: 0,
              borderTop: '1px solid var(--border, #d4cfc9)',
              opacity: h === 0 ? 0 : 0.6,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* All-day events: full-column colour blocks, split into equal slices */}
        {allDay.map((e, i) => (
          <div
            key={e.id}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => onEventClick?.(e)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(i / allDay.length) * 100}%`,
              width: `${(1 / allDay.length) * 100}%`,
              background: colorOf(e),
              opacity: 0.9,
              borderRight: allDay.length > 1 ? '1px solid rgba(255,255,255,0.3)' : undefined,
              color: '#fff',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '8px 4px',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            {e.title}
          </div>
        ))}

        {/* Draft preview during a drag */}
        {draft && (() => {
          const lo = Math.min(draft.aMin, draft.bMin)
          const hi = Math.max(draft.aMin, draft.bMin)
          return (
            <div
              style={{
                position: 'absolute',
                top: pct(lo),
                height: pct(Math.max(hi - lo, SNAP)),
                left: 2,
                right: 2,
                background: 'color-mix(in srgb, var(--accent, #b5936a) 35%, transparent)',
                border: '1px solid var(--accent, #b5936a)',
                borderRadius: 6,
                zIndex: 4,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'flex-start',
                padding: '2px 6px',
                fontSize: 11,
                color: 'var(--fg, #1a1a1a)',
              }}
            >
              {fmt(lo)}–{fmt(hi)}
            </div>
          )
        })()}

        {/* Timed events */}
        {timed.map((e) => {
          const { top, bot } = spanFor(e, day)
          const l = lanes.get(e.id) ?? { lane: 0, lanes: 1 }
          const gap = 1
          return (
            <div
              key={e.id}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => onEventClick?.(e)}
              style={{
                position: 'absolute',
                top: pct(top),
                height: pct(bot - top),
                left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`,
                width: `calc(${(1 / l.lanes) * 100}% - ${gap + 3}px)`,
                background: colorOf(e),
                color: '#fff',
                borderRadius: 6,
                padding: '2px 6px',
                fontSize: 11,
                lineHeight: 1.25,
                overflow: 'hidden',
                cursor: 'pointer',
                zIndex: 2,
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            >
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{e.title}</div>
              {bot - top >= 40 && (
                <div style={{ opacity: 0.85, fontSize: 10 }}>{fmt(top)}–{fmt(bot)}</div>
              )}
            </div>
          )
        })}

        {/* Now line */}
        {nowFrac !== null && (
          <div style={{ position: 'absolute', top: `${nowFrac * 100}%`, left: 0, right: 0, height: 0, borderTop: '2px solid var(--danger, #e5484d)', zIndex: 5, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -3, top: -4, width: 7, height: 7, borderRadius: '50%', background: 'var(--danger, #e5484d)' }} />
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
