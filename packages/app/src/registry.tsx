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
import { muralesCell } from '@muralink/module-murales/cell'
import { calcsheetCell } from '@muralink/module-calcsheet/cell'
import { expensesCell, expensesLedgerCell } from '@muralink/module-expenses/cell'
import { mailCell } from '@muralink/module-mail/cell'
import { mapsCell } from '@muralink/module-maps/cell'
import { MarkdownEditor, useNotes } from '@muralink/module-notes/web'
import { TimerBoard, useTracker, formatElapsed, elapsedMs, runningEntry } from '@muralink/module-tracker/web'
import { HabitsRow } from '@muralink/module-habits/web'
import { PasswordVault } from '@muralink/module-passwords/web'
import { useReminders } from '@muralink/module-reminders/web'
import { contactsApi, stockApi } from './api/index.ts'
import { galleryApi } from './galleryApi.ts'
// Side-effect wiring: projects tracker time entries into the calendar's events
// collection and injects the mural factory. Must run before any cell mounts.
import './trackerWiring.ts'

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

// Reads across every active target (local + optional api). Drag to create only
// when focused; unfocused = read-only view.
function CalendarCellView({ size, focused }: { size: GridSize; focused?: boolean }) {
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
      onCreate={focused ? (start, end) => void add(start, end) : undefined}
    />
  )
}

function ContactsCellView({ focused }: { focused?: boolean }) {
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.getContacts(),
  })
  return <ContactList contacts={contacts} readOnly={!focused} />
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

function StockCellView({ focused }: { focused?: boolean }) {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.getItems() })
  const adjust = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => stockApi.adjust(id, delta),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['stock'] }) },
  })
  return (
    <StockList
      items={items}
      readOnly={!focused}
      onAdjust={focused ? (id, delta) => adjust.mutate({ id, delta }) : undefined}
    />
  )
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

// Which visualization a calendar cell renders — seeded by the add-time variant
// picker, switchable later from the "Vista" config tab. Stored at props.view.
type CalendarCellVista = 'classic' | 'board'

function calendarVista(cell: GridCellRecord): CalendarCellVista {
  return cell.props?.['view'] === 'board' ? 'board' : 'classic'
}

const calendarCell: CellModule = {
  descriptor: {
    moduleId: 'calendar',
    label: 'Calendario',
    icon: '📅',
    description: 'Eventos y reservas',
    // The cell view is a vertical agenda — default and cap it tall/narrow so it
    // never sprawls into a wide, mostly-empty window.
    defaultSize: '2x3',
    availableSizes: ['2x2', '2x3', '3x3'],
    constraints: { orientation: 'tall', preferred: '2x3', min: '2x2', max: '2x3', aspect: 0.66 },
    // Android-widget-style add-time picker: same module, two visualizations.
    variants: [
      { id: 'classic', label: 'Agenda', icon: '📅', description: 'Vista clásica de eventos', defaultProps: { view: 'classic' } },
      { id: 'board', label: 'Tablero de cronómetros', icon: '⏱️', description: 'Botones con play/pausa que registran tiempo', defaultProps: { view: 'board' }, defaultSize: '2x2' },
    ],
  },
  render: (cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.(calendarVista(cell) === 'board' ? 'todo' : 'calendar')}>
      {calendarVista(cell) === 'board'
        ? <TimerBoard interactive={ctx.focused !== false} />
        : <CalendarCellView size={cell.size} focused={ctx.focused} />}
    </CellFrame>
  ),
  methods: [
    // Default view-mode click target: open the full calendar.
    { id: 'open', label: 'Abrir calendario', icon: '📅', isDefault: true, run: (_c, ctx) => ctx.openModal?.('calendar') },
    // Only surfaces in the ⋯ menu at 2x2 or larger (size-gated example).
    { id: 'newEvent', label: 'Nuevo evento', icon: '➕', visibility: { minSizes: ['2x2'] }, run: (_c, ctx) => ctx.openModal?.('calendar') },
  ],
  tabs: [
    {
      id: 'view',
      label: 'Vista',
      icon: '🪟',
      render: ({ cell, setConfig }) => {
        const current = calendarVista(cell)
        const opt = (id: CalendarCellVista, icon: string, label: string, description: string) => (
          <button
            key={id}
            onClick={() => setConfig(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
              borderRadius: 10, border: current === id ? '1px solid var(--accent, #6c8cff)' : '1px solid var(--border)',
              background: current === id ? 'var(--accent-dim, rgba(108,140,255,0.12))' : 'var(--bg)',
              color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{label}</span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--fg-faint)' }}>{description}</span>
            </span>
          </button>
        )
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opt('classic', '📅', 'Agenda', 'Vista clásica de eventos')}
            {opt('board', '⏱️', 'Tablero de cronómetros', 'Botones con play/pausa que registran tiempo')}
          </div>
        )
      },
    },
  ],
}

const contactsCell: CellModule = {
  descriptor: { moduleId: 'contacts', label: 'Contactos', icon: '👥', description: 'Lista de contactos', defaultSize: '2x2', availableSizes: ['2x2', '2x3', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('contacts')}>
      <ContactsCellView focused={ctx.focused} />
    </CellFrame>
  ),
}

const appointmentsCell: CellModule = {
  descriptor: {
    moduleId: 'appointments',
    label: 'Próximas citas',
    icon: '📋',
    description: 'Próximos eventos del calendario',
    // Also a vertical list — prefer a tall footprint.
    defaultSize: '2x3',
    availableSizes: ['2x2', '2x3', '3x2'],
    constraints: { orientation: 'tall', preferred: '2x3', min: '2x2', max: '2x3', aspect: 0.66 },
  },
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
      <StockCellView focused={ctx.focused} />
    </CellFrame>
  ),
}

// ── Habits cell (today's round checks) ───────────────────────────────────────

const habitsCell: CellModule = {
  descriptor: {
    moduleId: 'habits',
    label: 'Hábitos',
    icon: '✔️',
    description: 'Checks diarios de hábitos buenos y malos',
    defaultSize: '2x1',
    availableSizes: ['2x1', '2x2', '3x2'],
  },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('habits')}>
      <div style={{ height: '100%', background: 'var(--bg-elevated)' }}>
        <HabitsRow interactive={ctx.focused !== false} />
      </div>
    </CellFrame>
  ),
  methods: [
    { id: 'open', label: 'Abrir hábitos', icon: '✔️', isDefault: true, run: (_c, ctx) => ctx.openModal?.('habits') },
  ],
}

// ── TODO cell (compact face of the TODO dashboard) ───────────────────────────

// Running timers + today's habit row + the next open tasks. Expand opens the
// full TODO dashboard (timers over project murals, habits, reminders).
function TodoCellView() {
  const timers = useTracker((s) => s.timers)
  const entries = useTracker((s) => s.entries)
  const trackerLoaded = useTracker((s) => s.loaded)
  const loadTracker = useTracker((s) => s.loadAll)
  const reminders = useReminders((s) => s.reminders)
  const remindersLoaded = useReminders((s) => s.loaded)
  const loadReminders = useReminders((s) => s.loadAll)

  useEffect(() => { if (!trackerLoaded) void loadTracker() }, [trackerLoaded, loadTracker])
  useEffect(() => { if (!remindersLoaded) void loadReminders() }, [remindersLoaded, loadReminders])

  const running = timers.filter((t) => runningEntry(entries, t.id))
  // Tick only while something runs (component-local; never touches the grid).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (running.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running.length])

  const open = reminders.filter((r) => !r.done).slice(0, 3)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
      {running.length > 0 && (
        <div style={{ padding: '8px 10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {running.map((t) => {
            const entry = runningEntry(entries, t.id)!
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent, #6c8cff)' }}>
                <span>{t.emoji ?? '⏱️'}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg)' }}>{t.title}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(elapsedMs(entry, now))}</span>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ flexShrink: 0, minHeight: 56 }}>
        <HabitsRow interactive={false} size={30} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {open.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-dim)' }}>
            <span style={{ fontSize: 9 }}>◯</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || 'Sin título'}</span>
          </div>
        ))}
        {open.length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Sin tareas pendientes</div>}
      </div>
    </div>
  )
}

const todoCell: CellModule = {
  descriptor: {
    moduleId: 'todo',
    label: 'Tareas',
    icon: '✅',
    description: 'Cronómetros, hábitos y tareas del día',
    defaultSize: '2x3',
    availableSizes: ['2x2', '2x3'],
    constraints: { orientation: 'tall', preferred: '2x3' },
  },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('todo')}>
      <TodoCellView />
    </CellFrame>
  ),
  methods: [
    { id: 'open', label: 'Abrir tareas', icon: '✅', isDefault: true, run: (_c, ctx) => ctx.openModal?.('todo') },
  ],
}

const clockCell: CellModule = {
  descriptor: { moduleId: 'clock', label: 'Reloj', icon: '🕐', description: 'Hora actual', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2'] },
  render: (cell) => <ClockCellView size={cell.size} />,
}

// ── Gallery cell (recent thumbs; opens the full gallery view) ─────────────────

function GalleryCellView() {
  const { data } = useQuery({
    queryKey: ['gallery', 'recent'],
    queryFn: () => galleryApi.items({ limit: 9 }),
    staleTime: 60_000,
  })
  const items = data?.items ?? []
  if (items.length === 0) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--fg-dim)', fontSize: 24 }}>🖼️</div>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, height: '100%', overflow: 'hidden' }}>
      {items.map((item) => (
        <img
          key={item.id}
          src={galleryApi.thumbUrl(item.id)}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '1 / 1', display: 'block' }}
        />
      ))}
    </div>
  )
}

const galleryCell: CellModule = {
  descriptor: { moduleId: 'gallery', label: 'Galería', icon: '🖼️', description: 'Fotos y vídeos recientes del NAS', defaultSize: '2x2', availableSizes: ['1x1', '2x2', '3x2'] },
  render: (_cell, ctx) => (
    <CellFrame onExpand={() => ctx.openModal?.('gallery')}>
      <GalleryCellView />
    </CellFrame>
  ),
}

// ── Text cell (editable in place with the notes "bloc de notas" editor) ───────

// A page-list title derived from the first non-empty line of the body, so a
// Nota widget shows something meaningful in the Notas page sidebar.
function deriveNoteTitle(body: string): string {
  const first = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const clean = first.replace(/^#{1,6}\s+/, '').replace(/[*_`>~]/g, '').trim()
  return clean.slice(0, 80) || 'Untitled'
}

// A "Nota" widget IS a note: the cell stores only props.noteId and reads/writes
// the shared notes store, so every Nota also appears in the Notas page and edits
// sync both ways. Cells persisted before this held their text inline in
// props.text — on first render we lift that into a real note and repoint the
// cell, so legacy widgets migrate the moment their dashboard is opened.
function TextCellView({ cell, ctx, isDragging }: { cell: GridCellRecord; ctx: CellContext; isDragging: boolean }) {
  const noteId = cell.props?.noteId as string | undefined
  const legacyText = (cell.props?.text as string) ?? ''

  const loaded = useNotes((s) => s.loaded)
  const loadAll = useNotes((s) => s.loadAll)
  const create = useNotes((s) => s.create)
  const update = useNotes((s) => s.update)
  const note = useNotes((s) => (noteId ? s.notes.find((n) => n.id === noteId) : undefined))

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  // Ensure the cell points at a real note. Guarded so React strict-mode's double
  // effect (and re-renders while the async create is in flight) don't spawn a
  // duplicate note for the same cell.
  const ensuring = useRef(false)
  useEffect(() => {
    if (noteId || !loaded || ensuring.current) return
    ensuring.current = true
    void create({ title: deriveNoteTitle(legacyText), body: legacyText }).then((n) => {
      ctx.updateCell?.(cell.id, { props: { noteId: n.id, text: undefined } })
    })
  }, [noteId, loaded, create, ctx, cell.id, legacyText])

  function handleChange(next: string) {
    if (!noteId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const patch: { body: string; title?: string } = { body: next }
      // Keep the title mirroring the body only while the user hasn't set a custom
      // one in the Notas page (i.e. the stored title still matches its own body).
      if (!note || note.title === deriveNoteTitle(note.body)) patch.title = deriveNoteTitle(next)
      void update(noteId, patch)
    }, 400)
  }

  const value = note?.body ?? legacyText
  const editable = !isDragging && !!note

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 8, background: 'var(--bg-elevated)' }}>
      <MarkdownEditor value={value} onChange={handleChange} readOnly={!editable || !ctx.focused} placeholder="Texto…" />
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
  // Rename only when focused; unfocused = static label (open via the ⤢ expand).
  const canRename = !!ctx.focused

  function commit() {
    setEditing(false)
    ctx.updateCell?.(cell.id, { props: { name: draft.trim() || 'Dashboard' } })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 12 }}>
      <span style={{ fontSize: 34, lineHeight: 1 }}>🗂</span>
      {editing && canRename ? (
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
          onClick={canRename ? () => setEditing(true) : undefined}
          title={canRename ? 'Rename' : name}
          style={{ maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, fontWeight: 600, cursor: canRename ? 'text' : 'default' }}
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

// ── Vault cell (cloud-backed recursive dashboard) ─────────────────────────────

// Like the sub-dashboard, but its child grid persists to the account's cloud
// core instead of localStorage, so notes/files/instances inside it converge
// across every device in realtime. Expand descends into `vault:<vaultId>`; the
// `vault:` prefix is what makes App.tsx pick the cloud layout adapter for the
// whole subtree. vaultId is minted once on first render and kept in props so the
// same vault is addressed by every device.
function VaultCellView({ cell, ctx }: { cell: GridCellRecord; ctx: CellContext }) {
  const name = (cell.props?.name as string) ?? 'Vault'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  useEffect(() => { setDraft(name) }, [name])

  // Mint a stable vault id once. Address the same cloud layout on every device.
  useEffect(() => {
    if (!cell.props?.vaultId) {
      ctx.updateCell?.(cell.id, { props: { vaultId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } })
    }
  }, [cell.id, cell.props?.vaultId])

  function commit() {
    setEditing(false)
    ctx.updateCell?.(cell.id, { props: { name: draft.trim() || 'Vault' } })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--bg-elevated)', borderRadius: 12, position: 'relative' }}>
      <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color: 'var(--accent, #6c8cff)', textTransform: 'uppercase' }}>☁ nube</span>
      <span style={{ fontSize: 34, lineHeight: 1 }}>🗄️</span>
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

const vaultCell: CellModule = {
  descriptor: { moduleId: 'vault', label: 'Vault', icon: '🗄️', description: 'Dashboard en la nube, multi-dispositivo', defaultSize: '1x1', availableSizes: ['1x1', '2x1', '1x2', '2x2'] },
  render: (cell, ctx) => {
    const vaultId = (cell.props?.vaultId as string) || cell.id
    return (
      <CellFrame onExpand={() => ctx.navigateTo?.(`vault:${vaultId}`, (cell.props?.name as string) || 'Vault')}>
        <VaultCellView cell={cell} ctx={ctx} />
      </CellFrame>
    )
  },
}

// ── Passwords cell (PIN-gated local vault) ───────────────────────────────────

// No expand affordance: the vault has no full-page view, and its whole security
// story is that the decrypted entries never leave this component's lifetime.
const passwordsCell: CellModule = {
  descriptor: { moduleId: 'passwords', label: 'Contraseñas', icon: '🔐', description: 'Bóveda cifrada con PIN de 6 dígitos', defaultSize: '2x2', availableSizes: ['2x2'] },
  render: () => <PasswordVault />,
}

export function buildWebRegistry(): CellRegistry {
  const registry = new CellRegistry()
  registry.registerAll([calendarCell, contactsCell, appointmentsCell, stockCell, habitsCell, todoCell, clockCell, notesCell, muralesCell, textCell, dashboardCell, vaultCell, galleryCell, calcsheetCell, expensesCell, expensesLedgerCell, mailCell, mapsCell, passwordsCell])
  return registry
}
