// The TODO dashboard: a fixed 2-column composition with timers on top, then
// today's habit checks, then the reminders checklist. Lives in the app (not in
// any module) because it composes four module stores — tracker + habits +
// reminders + murales — which as leaf modules must not depend on each other.
//
// Each timer is the face of a project mural: created timers attach a fresh
// mural by default (via the injected factory) which can be opened, reassigned
// or detached from the per-timer panel.

import { useEffect, useState } from 'react'
import { TimerTile, useTracker } from '@muralink/module-tracker/web'
import type { YTimerDef } from '@muralink/module-tracker/types'
import { HabitsRow } from '@muralink/module-habits/web'
import { useReminders } from '@muralink/module-reminders/web'
import { useMurales } from '@muralink/module-murales/web'
import { useView } from './viewStore.ts'

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 2px 6px' }}>
      {children}
    </div>
  )
}

// Per-timer project panel: shows/reassigns the mural behind the timer.
function TimerProjectPanel({ timer, onClose }: { timer: YTimerDef; onClose: () => void }) {
  const murales = useMurales((s) => s.murales)
  const muralesLoaded = useMurales((s) => s.loaded)
  const loadMurales = useMurales((s) => s.loadAll)
  const createMural = useMurales((s) => s.create)
  const updateTimer = useTracker((s) => s.updateTimer)
  const removeTimer = useTracker((s) => s.removeTimer)
  const setView = useView((s) => s.setView)

  const [title, setTitle] = useState(timer.title)

  useEffect(() => { if (!muralesLoaded) void loadMurales() }, [muralesLoaded, loadMurales])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{timer.emoji ?? '⏱️'}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title !== timer.title) void updateTimer(timer.id, { title: title.trim() }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 13, fontWeight: 600, outline: 'none' }}
        />
        <button
          onClick={() => { if (confirm(`¿Eliminar “${timer.title}”? Sus registros de tiempo se conservan.`)) { onClose(); void removeTimer(timer.id) } }}
          title="Eliminar cronómetro"
          style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 13 }}
        >
          🗑
        </button>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Proyecto (mural)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflow: 'auto' }}>
        {timer.muralId && (
          <button
            onClick={() => setView('murales', timer.muralId)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--accent, #6c8cff)', background: 'var(--accent-dim, rgba(108,140,255,0.12))', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
          >
            🧱 Abrir mural actual
          </button>
        )}
        {murales.map((m) => (
          <button
            key={m.id}
            onClick={() => void updateTimer(timer.id, { muralId: m.id })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: m.id === timer.muralId ? 'var(--bg-elevated)' : 'transparent',
              color: 'var(--fg)', cursor: 'pointer', textAlign: 'left', fontSize: 12,
            }}
          >
            <span>{m.emoji ?? '🧱'}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title || 'Sin título'}</span>
            {m.id === timer.muralId && <span style={{ color: 'var(--accent, #6c8cff)' }}>●</span>}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => void createMural({ title: timer.title }).then((m) => updateTimer(timer.id, { muralId: m.id }))}
          style={{ flex: 1, border: '1px dashed var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 12, padding: '6px 8px' }}
        >
          ＋ Mural nuevo
        </button>
        {timer.muralId && (
          <button
            onClick={() => void updateTimer(timer.id, { muralId: undefined })}
            style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12, padding: '6px 8px' }}
          >
            Desvincular
          </button>
        )}
      </div>
    </div>
  )
}

function RemindersChecklist() {
  const reminders = useReminders((s) => s.reminders)
  const loaded = useReminders((s) => s.loaded)
  const loadAll = useReminders((s) => s.loadAll)
  const toggle = useReminders((s) => s.toggle)
  const createReminder = useReminders((s) => s.create)

  const [newTitle, setNewTitle] = useState('')

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  async function add() {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await createReminder({ title })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {reminders.map((r) => (
        <label
          key={r.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', color: r.done ? 'var(--fg-faint)' : 'var(--fg)', fontSize: 13 }}
        >
          <input type="checkbox" checked={r.done} onChange={() => void toggle(r.id)} />
          <span style={{ flex: 1, minWidth: 0, textDecoration: r.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.title || 'Sin título'}
          </span>
          {r.dueAt && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              {new Date(r.dueAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </label>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); void add() }} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nueva tarea…"
          style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--fg)', fontSize: 13, padding: '6px 10px', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--fg)', cursor: newTitle.trim() ? 'pointer' : 'default', fontSize: 13, padding: '6px 10px' }}
        >
          ＋
        </button>
      </form>
    </div>
  )
}

export function TodoDashboard() {
  const timers = useTracker((s) => s.timers)
  const entries = useTracker((s) => s.entries)
  const loaded = useTracker((s) => s.loaded)
  const loadAll = useTracker((s) => s.loadAll)
  const createTimer = useTracker((s) => s.createTimer)
  const start = useTracker((s) => s.start)
  const stop = useTracker((s) => s.stop)
  const murales = useMurales((s) => s.murales)
  const setView = useView((s) => s.setView)

  // Which timer's project panel is open, if any.
  const [panelFor, setPanelFor] = useState<string | null>(null)

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  const visible = timers.filter((t) => !t.archived)
  const muralOf = (t: YTimerDef) => (t.muralId ? murales.find((m) => m.id === t.muralId) : undefined)

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 14, boxSizing: 'border-box', maxWidth: 560, margin: '0 auto' }}>
      <SectionTitle>Cronómetros</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {visible.map((t) => {
          const mural = muralOf(t)
          return (
            <div key={t.id} style={{ display: 'contents' }}>
              <div style={{ position: 'relative' }}>
                <TimerTile
                  timer={t}
                  entries={entries}
                  interactive
                  onToggle={(timer, running) => void (running ? stop(timer.id) : start(timer.id))}
                  footer={
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (t.muralId) setView('murales', t.muralId)
                        else setPanelFor(t.id)
                      }}
                      title={mural ? `Abrir mural: ${mural.title}` : 'Sin proyecto'}
                      style={{ marginTop: 2, maxWidth: '94%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 10 }}
                    >
                      {mural ? `${mural.emoji ?? '🧱'} ${mural.title || 'Mural'}` : t.muralId ? '🧱 Mural' : '· sin proyecto ·'}
                    </button>
                  }
                />
                <button
                  onClick={() => setPanelFor(panelFor === t.id ? null : t.id)}
                  title="Proyecto y ajustes"
                  style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ⚙
                </button>
              </div>
              {panelFor === t.id && <TimerProjectPanel timer={t} onClose={() => setPanelFor(null)} />}
            </div>
          )
        })}
        <button
          onClick={() => void createTimer()}
          title="Nuevo cronómetro (con mural nuevo)"
          style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 22 }}
        >
          ＋
          <span style={{ fontSize: 10 }}>Cronómetro</span>
        </button>
        <button
          onClick={() => void createTimer(undefined, { withMural: false })}
          title="Nuevo cronómetro vacío (sin mural)"
          style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 22, opacity: 0.7 }}
        >
          ○
          <span style={{ fontSize: 10 }}>Vacío</span>
        </button>
      </div>

      <div style={{ height: 16 }} />
      <SectionTitle>Hábitos</SectionTitle>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)', minHeight: 64 }}>
        <HabitsRow />
      </div>

      <div style={{ height: 16 }} />
      <SectionTitle>Tareas</SectionTitle>
      <RemindersChecklist />
    </div>
  )
}
