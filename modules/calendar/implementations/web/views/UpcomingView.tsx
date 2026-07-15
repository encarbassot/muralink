import type { YCalendarEvent } from '../../../types.ts'

interface Props {
  events?: YCalendarEvent[]
  onEventClick?: (event: YCalendarEvent) => void
}

function dayLabel(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return date.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function eventColor(e: YCalendarEvent): string {
  return e.metadata?.['color'] ?? 'var(--accent)'
}

export function UpcomingView({ events = [], onEventClick }: Props) {
  const now = new Date()
  const sorted = [...events].sort((a, b) => a.start.iso.localeCompare(b.start.iso))

  // Group by day label
  const groups = new Map<string, YCalendarEvent[]>()
  for (const e of sorted) {
    const label = dayLabel(new Date(e.start.iso))
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(e)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: 12, gap: 16 }}>
      {sorted.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--fg-faint)', fontStyle: 'italic' }}>No hay eventos próximos</div>
      )}
      {Array.from(groups.entries()).map(([label, items]) => (
        <div key={label}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', fontWeight: 600, marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map((e) => {
              const isPast = new Date(e.end.iso) < now
              return (
                <div
                  key={e.id}
                  onClick={() => onEventClick?.(e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    opacity: isPast ? 0.4 : 1,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: eventColor(e) }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isPast ? 'line-through' : 'none' }}>
                      {e.title}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                      {formatTime(e.start.iso)}{e.end ? ` – ${formatTime(e.end.iso)}` : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
