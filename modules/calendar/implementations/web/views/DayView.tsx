// The calendar app surface. Mobile-first: a single centered vertical frame that
// holds one day at a time. On desktop the frame stays phone-width and centred
// (the app "en formato vertical centrada"). Drag on the column to create, tap an
// event to edit. A storage-target selector picks where new events are saved and
// which targets are shown. Reads/writes go through the unified useEvents store;
// a poll keeps every frontend converged when an API target is active.

import { useEffect, useMemo, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { useEvents, listProviders } from '../eventsStore.ts'
import { DayColumn } from './DayColumn.tsx'

const POLL_MS = 15_000

const COLORS = ['#b5936a', '#e5484d', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#0d9488']

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

  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  const reload = useEvents((s) => s.reload)
  const add = useEvents((s) => s.add)
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

  const dayEvents = events.filter((e) => overlapsDay(e, from, to))

  async function handleCreate(start: Date, end: Date) {
    const ev = await add(start, end, { color: COLORS[0] })
    if (ev) setEditing(ev)
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
          <DayColumn day={anchor} events={dayEvents} onCreate={handleCreate} onEventClick={setEditing} />
        </div>

        <div style={{ flexShrink: 0, padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
          Nuevos eventos → <b>{providerLabel(defaultTarget)}</b> · arrastra en la columna para crear
        </div>
      </div>

      {editing && <EventEditor event={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function providerLabel(id: string): string {
  return listProviders().find((p) => p.id === id)?.label ?? id
}

// Storage targets: N locations, extensible. Toggle which are shown; pick the
// default (where new events land). Never expose disabling the last one.
function TargetPanel({ onClose }: { onClose: () => void }) {
  const activeTargets = useEvents((s) => s.activeTargets)
  const defaultTarget = useEvents((s) => s.defaultTarget)
  const toggleTarget = useEvents((s) => s.toggleTarget)
  const setDefaultTarget = useEvents((s) => s.setDefaultTarget)
  const providers = listProviders()

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg, #f5f2ee)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: 'var(--fg)' }}>Dónde se guardan las citas</span>
        <button onClick={onClose} style={{ ...navBtn, padding: '2px 8px' }}>✕</button>
      </div>
      {providers.map((p) => {
        const on = activeTargets.includes(p.id)
        const isDefault = defaultTarget === p.id
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', fontSize: 13, color: 'var(--fg)' }}>
              <input type="checkbox" checked={on} onChange={() => toggleTarget(p.id)} />
              {p.label}
              {p.local && <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>offline</span>}
            </label>
            <button
              onClick={() => setDefaultTarget(p.id)}
              disabled={isDefault}
              style={{
                ...navBtn,
                fontSize: 11,
                padding: '3px 8px',
                background: isDefault ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                color: isDefault ? 'var(--accent)' : 'var(--fg-dim)',
                cursor: isDefault ? 'default' : 'pointer',
              }}
            >
              {isDefault ? 'Por defecto' : 'Usar'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Bottom-sheet editor for a single event.
function EventEditor({ event, onClose }: { event: YCalendarEvent; onClose: () => void }) {
  const update = useEvents((s) => s.update)
  const remove = useEvents((s) => s.remove)
  const moveEvent = useEvents((s) => s.moveEvent)
  const providers = listProviders()

  const [title, setTitle] = useState(event.title)
  const [color, setColor] = useState(event.metadata?.['color'] ?? COLORS[0])
  const [allDay, setAllDay] = useState(event.allDay)

  async function save() {
    await update(event.id, {
      title: title.trim() || 'Sin título',
      allDay,
      metadata: { ...(event.metadata ?? {}), color: color! },
    })
    onClose()
  }

  return (
    <div onClick={save} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--bg-elevated, #fff)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          placeholder="Título del evento"
          style={{ fontSize: 18, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)' }}
        />

        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          {new Date(event.start.iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {' – '}
          {new Date(event.end.iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Colour */}
        <div style={{ display: 'flex', gap: 8 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--fg)' : '2px solid transparent', cursor: 'pointer' }}
            />
          ))}
        </div>

        {/* All-day */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)' }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Todo el día (pinta la columna entera)
        </label>

        {/* Move between targets */}
        {providers.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)' }}>
            <span style={{ color: 'var(--fg-dim)' }}>Guardado en:</span>
            <select
              value={event.spaceId ?? ''}
              onChange={(e) => moveEvent(event.id, e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)' }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => { remove(event.id); onClose() }} style={{ ...navBtn, color: 'var(--danger, #e5484d)', borderColor: 'var(--danger, #e5484d)' }}>Eliminar</button>
          <div style={{ flex: 1 }} />
          <button onClick={save} style={{ ...navBtn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '8px 18px', fontWeight: 600 }}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg-dim)',
  cursor: 'pointer',
  fontSize: 13,
}
