import type { YCalendarEvent } from '../../../types.ts'

interface Props {
  events?: YCalendarEvent[]
  onEventClick?: (event: YCalendarEvent) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function DayStrip({ events = [], onEventClick }: Props) {
  const today = new Date()
  const todayEvents = events
    .filter(e => {
      const d = new Date(e.start.iso)
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      )
    })
    .sort((a, b) => a.start.iso.localeCompare(b.start.iso))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border, #d4cfc9)', color: 'var(--foreground, #1a1a1a)' }}>
        Hoy — {today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {todayEvents.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin citas hoy</div>
        ) : (
          todayEvents.map(event => (
            <div
              key={event.id}
              onClick={() => onEventClick?.(event)}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border, #d4cfc9)',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)', minWidth: 40 }}>
                {formatTime(event.start.iso)}
              </div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{event.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>
                {Math.round(event.duration.seconds / 60)}min
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
