// The embed dashboard's cell registry. Unlike the web platform's registry
// (which fetches via react-query), every cell here is local-first: it reads the
// module's spaced zustand store, so the dashboard works offline and syncs to
// the company server / cloud exactly like the standalone module apps. Cells
// with an "expand" affordance open the module's full app in an in-embed modal.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CellRegistry, type CellModule, type CellContext } from '@muralink/shell'
import type { GridCellRecord, GridSize } from '@muralink/types'
import { CalendarWidget, UpcomingView, useEvents } from '@muralink/module-calendar/web'
import { ContactList, useContacts } from '@muralink/module-contacts/web'
import { NotesCard, MarkdownEditor } from '@muralink/module-notes/web'
import { RemindersApp } from '@muralink/module-reminders/web'
import { useMuralUser } from '../MuralProvider.tsx'

// ── A frame that adds a hover "expand" button over any cell ──────────────────

function CellFrame({ onExpand, children }: { onExpand?: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', height: '100%', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-elevated)' }}
    >
      {onExpand && (
        <button
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          title="Abrir vista completa"
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg-dim)',
            cursor: 'pointer', fontSize: 12, opacity: hover ? 1 : 0, transition: 'opacity 0.12s',
          }}
        >
          ⤢
        </button>
      )}
      <div style={{ height: '100%' }}>{children}</div>
    </div>
  )
}

// ── Cell views (read the local-first store, render the module component) ─────

function weekStartDate() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function wideRange(): { from: Date; to: Date } {
  const from = new Date(); from.setDate(from.getDate() - 31); from.setHours(0, 0, 0, 0)
  const to = new Date(); to.setDate(to.getDate() + 62); to.setHours(0, 0, 0, 0)
  return { from, to }
}

function CalendarCellView({ size }: { size: GridSize }) {
  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  const add = useEvents((s) => s.add)
  const user = useMuralUser()

  useEffect(() => {
    const { from, to } = wideRange()
    void load(from, to)
  }, [load])

  return (
    <CalendarWidget
      size={size}
      events={events}
      weekStart={weekStartDate()}
      onCreate={(start, end) => void add(start, end, { createdBy: user?.id, color: user?.color })}
    />
  )
}

function ContactsCellView() {
  const contacts = useContacts((s) => s.contacts)
  const loaded = useContacts((s) => s.loaded)
  const loadAll = useContacts((s) => s.loadAll)
  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])
  return <ContactList contacts={contacts} />
}

function UpcomingCellView() {
  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  useEffect(() => {
    const { from, to } = wideRange()
    void load(from, to)
  }, [load])

  const now = Date.now()
  const upcoming = events.filter((e) => new Date(e.end.iso).getTime() >= now)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, color: 'var(--fg)', borderBottom: '1px solid var(--border)' }}>
        Próximas citas
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <UpcomingView events={upcoming} />
      </div>
    </div>
  )
}

function ClockCellView({ size }: { size: GridSize }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const tall = size.split('x')[1] !== '1'
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 12, gap: 4 }}>
      <div style={{ fontSize: tall ? 40 : 30, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
        {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
        {now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
    </div>
  )
}

// ── Text cell (editable in place with the notes "bloc de notas" editor) ──────

function TextCellView({ cell, ctx, isDragging }: { cell: GridCellRecord; ctx: CellContext; isDragging: boolean }) {
  const value = (cell.props?.['text'] as string) ?? ''
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function handleChange(next: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => ctx.updateCell?.(cell.id, { props: { text: next } }), 400)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 8, background: 'var(--bg-elevated)' }}>
      <MarkdownEditor value={value} onChange={handleChange} readOnly={isDragging} placeholder="Texto…" />
    </div>
  )
}

// ── Sub-dashboard cell (recursive dashboards in a tree) ──────────────────────

function DashboardCellView({ cell, ctx }: { cell: GridCellRecord; ctx: CellContext }) {
  const name = (cell.props?.['name'] as string) ?? 'Dashboard'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  useEffect(() => { setDraft(name) }, [name])

  function commit() {
    setEditing(false)
    ctx.updateCell?.(cell.id, { props: { name: draft.trim() || 'Dashboard' } })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 12 }}>
      <span style={{ fontSize: 34, lineHeight: 1 }}>🗂</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{ width: '80%', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--fg)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px' }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Renombrar"
          style={{ maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, fontWeight: 600, cursor: 'text' }}
        >
          {name}
        </button>
      )}
    </div>
  )
}

// ── Cell modules ─────────────────────────────────────────────────────────────

const calendarCell: CellModule = {
  descriptor: { moduleId: 'calendar', label: 'Calendario', icon: '📅', description: 'Eventos y agenda', defaultSize: '3x2', availableSizes: ['2x2', '3x2', '3x3'] },
  render: (cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('calendar')}>
      <CalendarCellView size={cell.size} />
    </CellFrame>
  ),
  methods: [
    { id: 'open', label: 'Abrir calendario', icon: '📅', isDefault: true, run: (_c, ctx) => ctx.openModal?.('calendar') },
  ],
}

const contactsCell: CellModule = {
  descriptor: { moduleId: 'contacts', label: 'Contactos', icon: '👥', description: 'Lista de contactos', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('contacts')}>
      <ContactsCellView />
    </CellFrame>
  ),
  methods: [
    { id: 'open', label: 'Abrir contactos', icon: '👥', isDefault: true, run: (_c, ctx) => ctx.openModal?.('contacts') },
  ],
}

const remindersCell: CellModule = {
  descriptor: { moduleId: 'reminders', label: 'Recordatorios', icon: '✅', description: 'Lista de tareas', defaultSize: '2x2', availableSizes: ['1x2', '2x2', '2x3'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('reminders')}>
      <RemindersApp />
    </CellFrame>
  ),
  methods: [
    { id: 'open', label: 'Abrir recordatorios', icon: '✅', isDefault: true, run: (_c, ctx) => ctx.openModal?.('reminders') },
  ],
}

const upcomingCell: CellModule = {
  descriptor: { moduleId: 'upcoming', label: 'Próximas citas', icon: '📋', description: 'Próximos eventos del calendario', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('calendar')}>
      <UpcomingCellView />
    </CellFrame>
  ),
}

const clockCell: CellModule = {
  descriptor: { moduleId: 'clock', label: 'Reloj', icon: '🕐', description: 'Hora actual', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2'] },
  render: (cell) => <ClockCellView size={cell.size} />,
}

const textCell: CellModule = {
  descriptor: { moduleId: 'text', label: 'Nota', icon: '📝', description: 'Nota simple — texto editable en sitio', defaultSize: '2x1', availableSizes: ['1x1', '2x1', '2x2', '2x3', '3x2'] },
  render: (cell, ctx, isDragging) => <TextCellView cell={cell} ctx={ctx} isDragging={isDragging} />,
  methods: [
    { id: 'edit', label: 'Editar en grande', icon: '✏️', isDefault: true, run: (cell, ctx) => ctx.openTextEditor?.(cell.id) },
  ],
}

// The full notes card stays registered (renders existing 'notes' cells) but
// hidden from the picker — 'text' is the simple note entry there.
const notesCell: CellModule = {
  descriptor: {
    moduleId: 'notes', label: 'Notas', icon: '📝', description: 'Bloc de notas markdown',
    defaultSize: '2x2', availableSizes: ['1x2', '2x1', '2x2', '2x3', '3x2', '3x3'], hiddenFromPicker: true,
  },
  render: (cell, ctx) => (
    <NotesCard size={cell.size} onExpand={() => ctx.openModal?.('notes')} />
  ),
}

const dashboardCell: CellModule = {
  descriptor: { moduleId: 'dashboard', label: 'Dashboard', icon: '🗂', description: 'Sub-dashboard anidado', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2', '2x2'] },
  render: (cell, ctx) => (
    <CellFrame onExpand={() => ctx.navigateTo?.(`${ctx.layoutId ?? ''}/${cell.id}`, (cell.props?.['name'] as string) || 'Dashboard')}>
      <DashboardCellView cell={cell} ctx={ctx} />
    </CellFrame>
  ),
}

export function buildEmbedRegistry(): CellRegistry {
  const registry = new CellRegistry()
  registry.registerAll([calendarCell, contactsCell, remindersCell, upcomingCell, clockCell, textCell, notesCell, dashboardCell])
  return registry
}
