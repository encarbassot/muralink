// The single-day app surface. Mobile-first: a single centered vertical frame
// that holds one day at a time. On desktop the frame stays phone-width and
// centred (the app "en formato vertical centrada"). Drag on the column to
// create, tap an event to edit. Reads/writes go through the unified useEvents
// store; a poll keeps every frontend converged when an API target is active.
// The editor and target panel are shared with WeekApp (EventEditor.tsx /
// TargetPanel.tsx).

import { useEffect, useMemo, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { baseIdOf, expandEvents } from '../../../recurrence.ts'
import { useEvents } from '../eventsStore.ts'
import { DayColumn } from './DayColumn.tsx'
import { FocusPeek } from './FocusPeek.tsx'
import { COLORS, EventEditor, navBtn } from './EventEditor.tsx'
import { TargetPanel, providerLabel } from './TargetPanel.tsx'

const POLL_MS = 15_000

function dayBounds(d: Date): { from: Date; to: Date } {
  const from = new Date(d)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

function overlapsDay(e: YCalendarEvent, from: Date, to: Date): boolean {
  return new Date(e.start.iso) < to && new Date(e.end.iso) > from
}

export function DayView() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [editing, setEditing] = useState<YCalendarEvent | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  const reload = useEvents((s) => s.reload)
  const add = useEvents((s) => s.add)
  const update = useEvents((s) => s.update)
  const remove = useEvents((s) => s.remove)
  const activeTargets = useEvents((s) => s.activeTargets)
  const defaultTarget = useEvents((s) => s.defaultTarget)

  const { from, to } = useMemo(() => dayBounds(anchor), [anchor])

  // Load whenever the day changes.
  useEffect(() => {
    load(from, to)
  }, [from.getTime(), to.getTime(), load, activeTargets])

  // Poll so all frontends converge (matters once an API target is on).
  useEffect(() => {
    const t = setInterval(() => reload(), POLL_MS)
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [reload])

  const dayEvents = useMemo(
    () => expandEvents(events, from, to).filter((e) => overlapsDay(e, from, to)),
    [events, from, to],
  )

  async function handleCreate(start: Date, end: Date) {
    const ev = await add(start, end, { color: COLORS[0] })
    if (ev) setEditing(ev)
  }

  function handleUpdate(ev: YCalendarEvent, start: Date, end: Date) {
    void update(ev.id, {
      start: { ...ev.start, iso: start.toISOString() },
      end: { ...ev.end, iso: end.toISOString() },
    })
  }

  function shift(dir: -1 | 1) {
    const d = new Date(anchor)
    d.setDate(d.getDate() + dir)
    setAnchor(d)
  }

  const isToday = dayBounds(new Date()).from.getTime() === from.getTime()
  const title = anchor.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ display: 'flex', justifyContent: 'center', height: '100%', background: 'var(--bg, #f5f2ee)' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated, #fff)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Header / pager */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={() => shift(-1)} style={navBtn}>‹</button>
          <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, fontWeight: isToday ? 700 : 400 }}>Hoy</button>
          <button onClick={() => shift(1)} style={navBtn}>›</button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--fg)', textTransform: 'capitalize', textAlign: 'center' }}>
            {title}
          </span>
          <button onClick={() => setShowTargets((v) => !v)} title="Dónde se guardan" style={navBtn}>⚙</button>
        </div>

        {showTargets && <TargetPanel onClose={() => setShowTargets(false)} />}

        {/* Day column fills the rest — top 00:00, bottom 23:59 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <DayColumn day={anchor} events={dayEvents} onCreate={handleCreate} onEventClick={setEditing} onUpdate={handleUpdate} focusId={focusedId} onFocusChange={setFocusedId} />
          {(() => {
            // Non-modal detail card: focused event, editor not open. The
            // calendar behind it stays operable (no backdrop).
            const focused = focusedId && !editing ? dayEvents.find((e) => e.id === focusedId) : undefined
            return focused ? (
              <FocusPeek
                event={focused}
                onEdit={() => setEditing(focused)}
                onDelete={() => { void remove(baseIdOf(focused.id)); setFocusedId(null) }}
                onDismiss={() => setFocusedId(null)}
              />
            ) : null
          })()}
        </div>

        <div style={{ flexShrink: 0, padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
          Nuevos eventos → <b>{providerLabel(defaultTarget)}</b> · arrastra en la columna para crear
        </div>
      </div>

      {editing && <EventEditor event={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
