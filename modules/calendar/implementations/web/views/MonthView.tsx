import type { YCalendarEvent } from '../../../types.ts'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

interface Props {
  events?: YCalendarEvent[]
  anchor?: Date
  onEventClick?: (event: YCalendarEvent) => void
  onDayClick?: (date: Date) => void
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MonthView({ events = [], anchor, onEventClick, onDayClick }: Props) {
  const base = anchor ?? new Date()
  const year = base.getFullYear()
  const month = base.getMonth()
  const now = new Date()

  // Group events by day key
  const byDay = new Map<string, YCalendarEvent[]>()
  for (const e of events) {
    const key = dateKey(new Date(e.start.iso))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(e)
  }

  const total = new Date(year, month + 1, 0).getDate()
  const startDay = new Date(year, month, 1).getDay()
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const todayKey = dateKey(now)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `repeat(${cells.length / 7}, 1fr)`,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} style={{ border: '1px solid var(--border)', opacity: 0.3 }} />
          }
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = byDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <div
              key={key}
              onClick={() => onDayClick?.(new Date(year, month, day))}
              style={{
                border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                background: isToday ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                padding: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                cursor: 'pointer',
                overflow: 'hidden',
                minHeight: 0,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--fg-dim)',
                }}
              >
                {day}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e) }}
                    style={{
                      fontSize: 10,
                      padding: '1px 4px',
                      borderRadius: 3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                      color: 'var(--fg)',
                    }}
                  >
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: 9, color: 'var(--fg-faint)', paddingLeft: 4 }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
