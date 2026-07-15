import { useEffect, useRef, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const SNAP = 15 // minutes

interface Props {
  events?: YCalendarEvent[]
  weekStart?: Date
  onSlotClick?: (date: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
  /** Drag (or click) on a day column to create an event spanning [start, end). */
  onCreate?: (start: Date, end: Date) => void
}

function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function eventTop(event: YCalendarEvent): number {
  const d = new Date(event.start.iso)
  return (d.getHours() + d.getMinutes() / 60) * 60
}

function eventHeight(event: YCalendarEvent): number {
  return (event.duration.seconds / 3600) * 60
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Minute-of-day from a pointer position within a day column (1px = 1min).
function minuteFromPointer(clientY: number, rect: DOMRect): number {
  const raw = clientY - rect.top
  return clamp(Math.round(raw / SNAP) * SNAP, 0, 1440)
}

function atMinute(day: Date, minute: number): Date {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(minute)
  return d
}

interface Draft {
  di: number
  aMin: number
  bMin: number
}

export function WeekView({ events = [], weekStart, onSlotClick, onEventClick, onCreate }: Props) {
  const start = weekStart ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const days = getWeekDays(start)
  const interactive = !!onCreate || !!onSlotClick

  const [draft, setDraft] = useState<Draft | null>(null)
  const dragRef = useRef<{ di: number; day: Date; rect: DOMRect; aMin: number } | null>(null)

  // Window-level move/up so the drag keeps tracking outside the column.
  useEffect(() => {
    if (!draft) return
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      setDraft({ di: d.di, aMin: d.aMin, bMin: minuteFromPointer(e.clientY, d.rect) })
    }
    function onUp(e: MouseEvent) {
      const d = dragRef.current
      if (d) {
        const b = minuteFromPointer(e.clientY, d.rect)
        let lo = Math.min(d.aMin, b)
        let hi = Math.max(d.aMin, b)
        if (hi - lo < SNAP) hi = Math.min(lo + 60, 1440) // a click → default 1h block
        const startDate = atMinute(d.day, lo)
        const endDate = atMinute(d.day, hi)
        if (onCreate) onCreate(startDate, endDate)
        else onSlotClick?.(startDate)
      }
      dragRef.current = null
      setDraft(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draft, onCreate, onSlotClick])

  function startDrag(di: number, day: Date, e: React.MouseEvent<HTMLDivElement>) {
    if (!interactive) return
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const m = minuteFromPointer(e.clientY, rect)
    dragRef.current = { di, day, rect, aMin: m }
    setDraft({ di, aMin: m, bMin: m })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <div />
        {days.map((day, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 12, fontWeight: 600, color: sameDay(day, new Date()) ? 'var(--primary, #1a1a1a)' : 'var(--muted-foreground, #6b6560)' }}>
            <div>{DAYS[day.getDay()]}</div>
            <div style={{ fontSize: 18, fontWeight: sameDay(day, new Date()) ? 700 : 400 }}>{day.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', position: 'relative', minHeight: `${24 * 60}px` }}>
          {/* Hour labels */}
          {HOURS.map(h => (
            <div key={h} style={{ gridColumn: 1, gridRow: h + 1, height: 60, borderTop: '1px solid var(--border, #d4cfc9)', display: 'flex', alignItems: 'flex-start', paddingTop: 2, justifyContent: 'center', fontSize: 10, color: 'var(--muted-foreground, #6b6560)' }}>
              {h > 0 ? `${h}:00` : ''}
            </div>
          ))}

          {/* Day columns */}
          {days.map((day, di) => (
            <div
              key={di}
              onMouseDown={(e) => startDrag(di, day, e)}
              style={{
                gridColumn: di + 2,
                gridRow: '1 / -1',
                position: 'relative',
                borderLeft: '1px solid var(--border, #d4cfc9)',
                cursor: interactive ? 'crosshair' : 'default',
              }}
            >
              {/* Hour grid lines (visual only) */}
              {HOURS.map(h => (
                <div key={h} style={{ height: 60, borderTop: '1px solid var(--border, #d4cfc9)', pointerEvents: 'none' }} />
              ))}

              {/* Draft preview during drag */}
              {draft && draft.di === di && (() => {
                const lo = Math.min(draft.aMin, draft.bMin)
                const hi = Math.max(draft.aMin, draft.bMin)
                const h = Math.max(hi - lo, 4)
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: lo,
                      height: h,
                      left: 2,
                      right: 2,
                      background: 'color-mix(in srgb, var(--accent) 35%, transparent)',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      zIndex: 2,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      padding: '1px 4px',
                      fontSize: 10,
                      color: 'var(--fg)',
                    }}
                  >
                    {fmtRange(lo, hi)}
                  </div>
                )
              })()}

              {/* Events */}
              {events.filter(e => sameDay(new Date(e.start.iso), day)).map(event => (
                <div
                  key={event.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onEventClick?.(event)}
                  style={{
                    position: 'absolute',
                    top: eventTop(event),
                    height: Math.max(eventHeight(event), 20),
                    left: 2,
                    right: 2,
                    backgroundColor: 'var(--accent, #b5936a)',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 11,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    zIndex: 1,
                  }}
                >
                  {event.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function fmtRange(loMin: number, hiMin: number): string {
  const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${f(loMin)}–${f(hiMin)}`
}
