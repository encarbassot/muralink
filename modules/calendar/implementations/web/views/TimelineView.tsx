import { useEffect, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

interface Props {
  events?: YCalendarEvent[]
  anchor?: Date
  onEventClick?: (event: YCalendarEvent) => void
}

function fmt2(n: number) { return String(n).padStart(2, '0') }

function weekDays(anchor: Date): Date[] {
  const d = new Date(anchor)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d)
    dd.setDate(d.getDate() + i)
    return dd
  })
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function positionEvent(startIso: string, endIso: string) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const startMin = s.getHours() * 60 + s.getMinutes()
  const endMin = e.getHours() * 60 + e.getMinutes()
  const top = (startMin / 1440) * 100
  const height = Math.max(((endMin - startMin) / 1440) * 100, 1.5)
  return { top: `${top}%`, height: `${height}%` }
}

function eventColor(e: YCalendarEvent): string {
  return e.metadata?.['color'] ?? 'var(--accent)'
}

export function TimelineView({ events = [], anchor, onEventClick }: Props) {
  const days = weekDays(anchor ?? new Date())

  const [nowMin, setNowMin] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const todayTop = `${(nowMin / 1440) * 100}%`

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'auto', height: '100%' }}>
      {/* Hour axis */}
      <div style={{ width: 40, flexShrink: 0, position: 'relative', height: 1440 }}>
        {HOURS.map((h) => (
          <div
            key={h}
            style={{ position: 'absolute', width: '100%', textAlign: 'right', paddingRight: 6, fontSize: 9, color: 'var(--fg-faint)', top: `${(h / 24) * 100}%`, transform: 'translateY(-50%)' }}
          >
            {fmt2(h)}:00
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div style={{ display: 'flex', flex: 1, borderLeft: '1px solid var(--border)', height: 1440 }}>
        {days.map((day) => {
          const isToday = sameDay(day, new Date())
          const dayEvents = events.filter((e) => sameDay(new Date(e.start.iso), day))
          return (
            <div key={day.toISOString()} style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--border)', minWidth: 0 }}>
              {/* Day header */}
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  textAlign: 'center',
                  padding: '3px 0',
                  fontSize: 10,
                  borderBottom: '1px solid var(--border)',
                  color: isToday ? 'var(--accent)' : 'var(--fg-faint)',
                  background: isToday ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
                }}
              >
                {DAY_NAMES[day.getDay()]} {day.getDate()}
              </div>

              {/* Hour lines */}
              {HOURS.map((h) => (
                <div key={h} style={{ position: 'absolute', width: '100%', borderTop: '1px solid var(--border)', opacity: 0.5, top: `${(h / 24) * 100}%` }} />
              ))}

              {/* Now indicator */}
              {isToday && (
                <div style={{ position: 'absolute', width: '100%', borderTop: '2px solid #ef4444', zIndex: 20, top: todayTop }}>
                  <div style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%', marginTop: -3, marginLeft: -3 }} />
                </div>
              )}

              {/* Events */}
              {dayEvents.map((e) => {
                const pos = positionEvent(e.start.iso, e.end.iso)
                const color = eventColor(e)
                return (
                  <div
                    key={e.id}
                    onClick={() => onEventClick?.(e)}
                    title={e.title}
                    style={{
                      position: 'absolute',
                      left: 2,
                      right: 2,
                      ...pos,
                      borderRadius: 4,
                      padding: '1px 4px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: 'color-mix(in srgb, var(--accent) 27%, transparent)',
                      borderLeft: `2px solid ${color}`,
                      zIndex: 1,
                    }}
                  >
                    <div style={{ fontSize: 9, color: 'var(--fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.title}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
