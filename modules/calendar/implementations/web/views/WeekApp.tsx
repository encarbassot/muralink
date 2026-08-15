// The week app surface — the calendar's main mobile screen. Same shell
// pattern as DayView (phone-width centered frame, header pager, target panel,
// bottom-sheet editor) but the content is the 7-column WeekViewMobile.
// Recurrences are expanded virtually here, in the view layer, so the store
// stays untouched. Checkbox toggles inside event spans write the base
// record's blocks through the store.

import { useEffect, useMemo, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { toggleBlockInFacets } from '@muralink/ui'
import { baseIdOf, expandEvents } from '../../../recurrence.ts'
import { useEvents } from '../eventsStore.ts'
import { WeekViewMobile } from './WeekViewMobile.tsx'
import { FocusPeek } from './FocusPeek.tsx'
import { COLORS, EventEditor, navBtn } from './EventEditor.tsx'
import { TargetPanel, providerLabel } from './TargetPanel.tsx'

const POLL_MS = 15_000

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay()) // Sunday-based, like CalendarApp
  return out
}

export function WeekApp() {
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

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    return d
  }, [weekStart])

  // Load whenever the week changes.
  useEffect(() => {
    load(weekStart, weekEnd)
  }, [weekStart.getTime(), weekEnd.getTime(), load, activeTargets])

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

  // Virtual recurrence expansion — occurrences get `${id}::${startIso}` ids.
  const visible = useMemo(() => expandEvents(events, weekStart, weekEnd), [events, weekStart, weekEnd])

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

  function handleToggleBlock(eventId: string, blockId: string, checked: boolean) {
    const base = events.find((e) => e.id === baseIdOf(eventId))
    const next = base?.blocks?.map((b) => (b.id === blockId ? { ...b, checked } : b))
    if (!base || !next) return
    const patch: Partial<YCalendarEvent> = { blocks: next }
    // Keep the canonical facets in step — otherwise reopening the editor
    // would show the checkbox stale.
    if (base.facets) patch.facets = toggleBlockInFacets(base.facets, blockId, checked)
    void update(baseIdOf(eventId), patch)
  }

  function shift(dir: -1 | 1) {
    const d = new Date(anchor)
    d.setDate(d.getDate() + dir * 7)
    setAnchor(d)
  }

  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime()
  const lastDay = new Date(weekStart)
  lastDay.setDate(lastDay.getDate() + 6)
  const title =
    weekStart.getMonth() === lastDay.getMonth()
      ? weekStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      : `${weekStart.toLocaleDateString('es-ES', { month: 'short' })} – ${lastDay.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`

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
          <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, fontWeight: isThisWeek ? 700 : 400 }}>Hoy</button>
          <button onClick={() => shift(1)} style={navBtn}>›</button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--fg)', textTransform: 'capitalize', textAlign: 'center' }}>
            {title}
          </span>
          <button onClick={() => setShowTargets((v) => !v)} title="Dónde se guardan" style={navBtn}>⚙</button>
        </div>

        {showTargets && <TargetPanel onClose={() => setShowTargets(false)} />}

        {/* Week grid fills the rest — top 00:00, bottom 23:59 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <WeekViewMobile
            weekStart={weekStart}
            events={visible}
            onCreate={handleCreate}
            onEventClick={setEditing}
            onToggleBlock={handleToggleBlock}
            onUpdate={handleUpdate}
            focusId={focusedId}
            onFocusChange={setFocusedId}
          />
          {(() => {
            // Non-modal detail card: focused event, editor not open. The
            // calendar behind it stays operable (no backdrop).
            const focused = focusedId && !editing ? visible.find((e) => e.id === focusedId) : undefined
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
          Nuevos eventos → <b>{providerLabel(defaultTarget)}</b> · arrastra en un día para crear
        </div>
      </div>

      {editing && <EventEditor event={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
