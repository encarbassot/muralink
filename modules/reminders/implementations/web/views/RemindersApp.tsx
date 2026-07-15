import { useEffect, useState } from 'react'
import { listSpaces } from '@muralink/spaces'
import type { YReminder } from '../../../types.ts'
import { useReminders } from '../remindersStore.ts'

// Standalone, local-first reminders app: a single checklist with due dates.
// Backed by IndexedDB (via useReminders) so it works offline with no backend;
// shared lists happen by saving to a shared space. Mirrors ContactsApp's
// design tokens.

type Filter = 'open' | 'done' | 'all'

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const due = new Date(iso)
  const now = new Date()
  const overdue = due.getTime() < now.getTime()
  const sameYear = due.getFullYear() === now.getFullYear()
  const text = due.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(iso.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
  return { text, overdue }
}

export function RemindersApp() {
  const reminders = useReminders((s) => s.reminders)
  const loaded = useReminders((s) => s.loaded)
  const loadAll = useReminders((s) => s.loadAll)
  const create = useReminders((s) => s.create)
  const update = useReminders((s) => s.update)
  const toggle = useReminders((s) => s.toggle)
  const remove = useReminders((s) => s.remove)
  const moveReminder = useReminders((s) => s.moveReminder)
  const defaultSpace = useReminders((s) => s.defaultSpace)

  const [filter, setFilter] = useState<Filter>('open')
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  const spaces = listSpaces('reminders')
  const openCount = reminders.filter((r) => !r.done).length

  const visible = reminders.filter((r) =>
    filter === 'all' ? true : filter === 'done' ? r.done : !r.done,
  )

  async function handleAdd() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await create({ title })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* Header + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>
          Recordatorios{openCount > 0 && <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> · {openCount} pendientes</span>}
        </span>
        {(['open', 'done', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              border: '1px solid var(--border)',
              background: filter === f ? 'var(--accent)' : 'var(--bg-elevated)',
              color: filter === f ? '#fff' : 'var(--fg-dim)',
              borderRadius: 6,
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {f === 'open' ? 'Pendientes' : f === 'done' ? 'Hechos' : 'Todos'}
          </button>
        ))}
      </div>

      {/* New reminder */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
          placeholder="Añadir recordatorio…"
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)' }}
        />
        <button
          onClick={() => void handleAdd()}
          disabled={!draft.trim()}
          style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, width: 30, cursor: 'pointer', fontSize: 15 }}
        >
          +
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loaded && visible.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
            {filter === 'done' ? 'Nada hecho todavía.' : 'Todo al día ✓'}
          </div>
        )}
        {visible.map((r) => (
          <ReminderRow
            key={`${r.spaceId}:${r.id}`}
            reminder={r}
            onToggle={() => void toggle(r.id)}
            onRemove={() => void remove(r.id)}
            onSetDue={(dueAt) => void update(r.id, { dueAt })}
            spaces={spaces.length > 1 ? spaces.map((s) => ({ id: s.id, label: s.label })) : undefined}
            onMove={(to) => void moveReminder(r.id, to)}
          />
        ))}
      </div>

      <div style={{ flexShrink: 0, padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
        Nuevos recordatorios → <b>{spaces.find((s) => s.id === defaultSpace)?.label ?? defaultSpace}</b>
      </div>
    </div>
  )
}

function ReminderRow({
  reminder,
  onToggle,
  onRemove,
  onSetDue,
  spaces,
  onMove,
}: {
  reminder: YReminder
  onToggle: () => void
  onRemove: () => void
  onSetDue: (dueAt: string | undefined) => void
  spaces?: { id: string; label: string }[]
  onMove: (to: string) => void
}) {
  const due = reminder.dueAt ? dueLabel(reminder.dueAt) : null

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', opacity: reminder.done ? 0.55 : 1 }}
    >
      <input type="checkbox" checked={reminder.done} onChange={onToggle} style={{ cursor: 'pointer' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', textDecoration: reminder.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {reminder.title || 'Sin título'}
        </div>
        {(due || reminder.createdBy) && (
          <div style={{ fontSize: 11, color: due?.overdue && !reminder.done ? 'var(--danger, #e5484d)' : 'var(--fg-dim)' }}>
            {due?.text}
            {due && reminder.createdBy ? ' · ' : ''}
            {reminder.createdBy}
          </div>
        )}
      </div>
      <input
        type="date"
        value={reminder.dueAt?.slice(0, 10) ?? ''}
        onChange={(e) => onSetDue(e.target.value || undefined)}
        title="Fecha límite"
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '2px 4px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg-dim)', width: 108 }}
      />
      {spaces && (
        <select
          value={reminder.spaceId ?? ''}
          onChange={(e) => onMove(e.target.value)}
          title="Dónde se guarda"
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '2px 4px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg-dim)', maxWidth: 90 }}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      )}
      <button
        onClick={onRemove}
        title="Eliminar"
        style={{ border: 'none', background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 14 }}
      >
        ✕
      </button>
    </div>
  )
}
