import { useEffect, useMemo, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { WeekView } from './WeekView.3x3.tsx'
import { MonthView } from './MonthView.tsx'
import { TimelineView } from './TimelineView.tsx'
import { UpcomingView } from './UpcomingView.tsx'

export type CalendarMode = 'month' | 'week' | 'timeline' | 'upcoming'

interface Props {
  events?: YCalendarEvent[]
  /** Fired when the visible range changes so the host can fetch events. */
  onRangeChange?: (from: Date, to: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
  /** Drag (or click) on the week grid to create an event. */
  onCreate?: (start: Date, end: Date) => void
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
function startOfWeek(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

function rangeFor(mode: CalendarMode, anchor: Date): { from: Date; to: Date } {
  if (mode === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  if (mode === 'upcoming') {
    const now = new Date()
    return { from: new Date(now.getTime() - 7 * 86400000), to: new Date(now.getTime() + 60 * 86400000) }
  }
  // week / timeline
  const from = startOfWeek(anchor)
  const to = new Date(from)
  to.setDate(to.getDate() + 7)
  return { from, to }
}

const MODES: { id: CalendarMode; label: string }[] = [
  { id: 'month', label: 'Mes' },
  { id: 'week', label: 'Semana' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'upcoming', label: 'Próximos' },
]

export function CalendarApp({ events = [], onRangeChange, onEventClick, onCreate }: Props) {
  const [mode, setMode] = useState<CalendarMode>('month')
  const [anchor, setAnchor] = useState(() => new Date())

  const { from, to } = useMemo(() => rangeFor(mode, anchor), [mode, anchor])

  useEffect(() => {
    onRangeChange?.(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()])

  function shift(dir: -1 | 1) {
    const d = new Date(anchor)
    if (mode === 'month') d.setMonth(d.getMonth() + dir)
    else d.setDate(d.getDate() + dir * 7)
    setAnchor(d)
  }

  const title =
    mode === 'month'
      ? anchor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      : mode === 'upcoming'
      ? 'Próximos eventos'
      : `${startOfWeek(anchor).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {mode !== 'upcoming' && (
          <>
            <NavBtn onClick={() => shift(-1)}>‹</NavBtn>
            <NavBtn onClick={() => setAnchor(new Date())}>Hoy</NavBtn>
            <NavBtn onClick={() => shift(1)}>›</NavBtn>
          </>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textTransform: 'capitalize', flex: 1 }}>
          {title}
        </span>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                border: 'none',
                cursor: 'pointer',
                background: mode === m.id ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                color: mode === m.id ? 'var(--accent)' : 'var(--fg-dim)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* View */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: mode === 'month' ? 12 : 0, boxSizing: 'border-box' }}>
        {mode === 'month' && <MonthView events={events} anchor={anchor} onEventClick={onEventClick} onDayClick={(d) => { setAnchor(d); setMode('timeline') }} />}
        {mode === 'week' && <WeekView events={events} weekStart={startOfWeek(anchor)} onEventClick={onEventClick} onCreate={onCreate} />}
        {mode === 'timeline' && <TimelineView events={events} anchor={anchor} onEventClick={onEventClick} />}
        {mode === 'upcoming' && <UpcomingView events={events} onEventClick={onEventClick} />}
      </div>
    </div>
  )
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 7,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--fg-dim)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
    </button>
  )
}
