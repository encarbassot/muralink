// Year view: a horizontal timeline for anchor.getFullYear() — one row per
// event, 12 month columns, each cell shaded "open" when the event's
// [start,end] range overlaps that month. Built for date-range data (contact
// public locations) as much as regular events — a single-day event just
// shades the one month it falls in.

import type { YCalendarEvent } from '../../../types.ts'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface Props {
  events?: YCalendarEvent[]
  anchor?: Date
  onEventClick?: (event: YCalendarEvent) => void
}

function eventColor(e: YCalendarEvent): string {
  return e.metadata?.['color'] ?? 'var(--accent)'
}

// True if the event's [start,end] range overlaps the given month.
function overlapsMonth(e: YCalendarEvent, year: number, month: number): boolean {
  const monthStart = new Date(year, month, 1).getTime()
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
  const start = new Date(e.start.iso).getTime()
  const end = new Date(e.end.iso).getTime()
  return start <= monthEnd && end >= monthStart
}

export function YearView({ events = [], anchor, onEventClick }: Props) {
  const year = (anchor ?? new Date()).getFullYear()
  const now = new Date()
  const rows = [...events].sort((a, b) => new Date(a.start.iso).getTime() - new Date(b.start.iso).getTime())

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 12, boxSizing: 'border-box' }}>
      {/* Month header */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(12, 1fr)', gap: 2, marginBottom: 6 }}>
        <div />
        {MONTH_NAMES.map((m, i) => (
          <div
            key={m}
            style={{
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: year === now.getFullYear() && i === now.getMonth() ? 'var(--accent)' : 'var(--fg-faint)',
              textTransform: 'uppercase',
            }}
          >
            {m}
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-faint)' }}>
          Sin eventos en {year}
        </div>
      )}

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((e) => {
          const color = eventColor(e)
          return (
            <div
              key={e.id}
              style={{ display: 'grid', gridTemplateColumns: '160px repeat(12, 1fr)', gap: 2, alignItems: 'center' }}
            >
              <div
                title={e.title}
                style={{ fontSize: 11, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}
              >
                {e.title}
              </div>
              {MONTH_NAMES.map((_, month) => {
                const open = overlapsMonth(e, year, month)
                return (
                  <button
                    key={month}
                    onClick={() => open && onEventClick?.(e)}
                    title={open ? e.title : undefined}
                    style={{
                      height: 18,
                      border: 'none',
                      borderRadius: 3,
                      cursor: open ? 'pointer' : 'default',
                      background: open ? `color-mix(in srgb, ${color} 55%, transparent)` : 'var(--bg-elevated)',
                      outline: open ? `1px solid ${color}` : '1px solid transparent',
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
