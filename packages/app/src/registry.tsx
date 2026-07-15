// The web platform's cell registry. CRM cells fetch their own data via
// react-query and render the existing 2x2 module components. Each cell has an
// "expand" affordance that opens the module's full view as a modal.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CellRegistry, type CellModule, type CellContext } from '@muralink/shell'
import type { GridCellRecord, GridSize } from '@muralink/types'
import { CalendarWidget, UpcomingView, useEvents } from '@muralink/module-calendar/web'
import { ContactList } from '@muralink/module-contacts/web'
import { StockList } from '@muralink/module-stock/web'
import { notesCell } from '@muralink/module-notes/cell'
import { MarkdownEditor } from '@muralink/module-notes/web'
import { contactsApi, stockApi } from './api/index.ts'

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
          title="Open full view"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 5,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--fg-dim)',
            cursor: 'pointer',
            fontSize: 12,
            opacity: hover ? 1 : 0,
            transition: 'opacity 0.12s',
          }}
        >
          ⤢
        </button>
      )}
      <div style={{ height: '100%' }}>{children}</div>
    </div>
  )
}

// ── Cell views (fetch + render module component) ─────────────────────────────

function weekStartDate() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

// A generous window so the bento cell shows nearby events across all active
// storage targets without a per-view range picker.
function wideRange(): { from: Date; to: Date } {
  const from = new Date(); from.setDate(from.getDate() - 31); from.setHours(0, 0, 0, 0)
  const to = new Date(); to.setDate(to.getDate() + 62); to.setHours(0, 0, 0, 0)
  return { from, to }
}

// Reads across every active target (local + optional api). Drag to create.
function CalendarCellView({ size }: { size: GridSize }) {
  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  const add = useEvents((s) => s.add)

  useEffect(() => {
    const { from, to } = wideRange()
    void load(from, to)
  }, [load])

  return (
    <CalendarWidget
      size={size}
      events={events}
      weekStart={weekStartDate()}
      onCreate={(start, end) => void add(start, end)}
    />
  )
}

function ContactsCellView() {
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.getContacts(),
  })
  return <ContactList contacts={contacts} />
}

// "Próximas citas" — a second view of the calendar module. Shows the upcoming
// events from the same local-first event store as the calendar widget.
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

function StockCellView() {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.getItems() })
  const adjust = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => stockApi.adjust(id, delta),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['stock'] }) },
  })
  return <StockList items={items} onAdjust={(id, delta) => adjust.mutate({ id, delta })} />
}

// ── Simple clock cell (web-local, token styled) ──────────────────────────────

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

// ── CRM cell modules ─────────────────────────────────────────────────────────

const calendarCell: CellModule = {
  descriptor: { moduleId: 'calendar', label: 'Calendario', icon: '📅', description: 'Eventos y reservas', defaultSize: '3x2', availableSizes: ['2x2', '3x2', '3x3'] },
  render: (cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('calendar')}>
      <CalendarCellView size={cell.size} />
    </CellFrame>
  ),
  methods: [
    // Default view-mode click target: open the full calendar.
    { id: 'open', label: 'Abrir calendario', icon: '📅', isDefault: true, run: (_c, ctx) => ctx.openModal?.('calendar') },
    // Only surfaces in the ⋯ menu at 2x2 or larger (size-gated example).
    { id: 'newEvent', label: 'Nuevo evento', icon: '➕', visibility: { minSizes: ['2x2'] }, run: (_c, ctx) => ctx.openModal?.('calendar') },
  ],
}

const contactsCell: CellModule = {
  descriptor: { moduleId: 'contacts', label: 'Contactos', icon: '👥', description: 'Lista de contactos', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('contacts')}>
      <ContactsCellView />
    </CellFrame>
  ),
}

const appointmentsCell: CellModule = {
  descriptor: { moduleId: 'appointments', label: 'Próximas citas', icon: '📋', description: 'Próximos eventos del calendario', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('calendar')}>
      <UpcomingCellView />
    </CellFrame>
  ),
}

const stockCell: CellModule = {
  descriptor: { moduleId: 'stock', label: 'Inventario', icon: '📦', description: 'Stock de productos', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('stock')}>
      <StockCellView />
    </CellFrame>
  ),
}

const clockCell: CellModule = {
  descriptor: { moduleId: 'clock', label: 'Reloj', icon: '🕐', description: 'Hora actual', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2'] },
  render: (cell) => <ClockCellView size={cell.size} />,
}

// ── Text cell (editable in place with the notes "bloc de notas" editor) ───────

// The persisted value is the source of truth: MarkdownEditor keeps its own doc
// while typing and only re-syncs when props.text actually changes (e.g. edited
// from the expand modal). We just debounce the write-back so we don't persist
// the whole layout on every keystroke.
function TextCellView({ cell, ctx, isDragging }: { cell: GridCellRecord; ctx: CellContext; isDragging: boolean }) {
  const value = (cell.props?.text as string) ?? ''
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

// The simple note view: a bare markdown block, no chrome, no action buttons.
// This is the single "Nota" entry in the add picker and the omnibar fallback
// target. The full notes app (📝 notes) stays registered but hidden from the picker.
const textCell: CellModule = {
  descriptor: { moduleId: 'text', label: 'Nota', icon: '📝', description: 'Nota simple — texto editable en sitio', defaultSize: '2x1', availableSizes: ['1x1', '2x1', '2x2', '2x3', '3x2'] },
  render: (cell, ctx, isDragging) => (
    <TextCellView cell={cell} ctx={ctx} isDragging={isDragging} />
  ),
}

// ── Sub-dashboard cell (recursive dashboards in a tree) ───────────────────────

// A folder tile. Expand (⤢) descends into the child grid; the child persists at
// its own layoutId (`<parentLayoutId>/<cellId>`). The name is editable in place.
function DashboardCellView({ cell, ctx }: { cell: GridCellRecord; ctx: CellContext }) {
  const name = (cell.props?.name as string) ?? 'Dashboard'
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
          title="Rename"
          style={{ maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, fontWeight: 600, cursor: 'text' }}
        >
          {name}
        </button>
      )}
    </div>
  )
}

const dashboardCell: CellModule = {
  descriptor: { moduleId: 'dashboard', label: 'Dashboard', icon: '🗂', description: 'Sub-dashboard anidado', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2', '2x2'] },
  render: (cell, ctx) => (
    <CellFrame onExpand={() => ctx.navigateTo?.(`${ctx.layoutId ?? ''}/${cell.id}`, (cell.props?.name as string) || 'Dashboard')}>
      <DashboardCellView cell={cell} ctx={ctx} />
    </CellFrame>
  ),
}

export function buildWebRegistry(): CellRegistry {
  const registry = new CellRegistry()
  registry.registerAll([calendarCell, contactsCell, appointmentsCell, stockCell, clockCell, notesCell, textCell, dashboardCell])
  return registry
}
