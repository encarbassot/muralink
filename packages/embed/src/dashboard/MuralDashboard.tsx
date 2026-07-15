// MuralDashboard — the full recursive bento dashboard, self-contained for
// embedding. Same experience as the Mural web frontend (drag/resize widgets,
// nested sub-dashboards, in-place markdown, a full-screen editor modal), but
// with no dock, no router, and no backend requirement. A trimmed port of the
// web platform's WebShell. Local-first: layout persists to localStorage,
// widget content to the module stores (@muralink/spaces).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ShellApp,
  type CellContext,
  type ModuleDescriptor,
  type CellMethod,
  type CellTab,
  type OnClickBinding,
} from '@muralink/shell'
import type { GridCellRecord, GridLayoutConfig, GridSize, GridPersistenceAdapter } from '@muralink/types'
import { localStorageAdapter, sizeSpan, type CellMenuItem } from '@muralink/ui'
import { NotesApp, MarkdownEditor } from '@muralink/module-notes/web'
import { ContactsApp } from '@muralink/module-contacts/web'
import { RemindersApp } from '@muralink/module-reminders/web'
import { CalendarBoard } from '../CalendarBoard.tsx'
import { MuralProvider, type MuralProviderProps, type MuralUser, type MuralSpacesConfig } from '../MuralProvider.tsx'
import { buildEmbedRegistry } from './registry.tsx'
import { WebAddElementModal } from './AddElementModal.tsx'
import { WidgetConfigModal } from './WidgetConfigModal.tsx'
import { makeOnClickTab } from './OnClickTab.tsx'
import { makeSizeTab } from './SizeTab.tsx'

interface Crumb {
  id: string
  title: string
}

export interface MuralDashboardProps {
  /** Root layout id — also the localStorage namespace. Nested dashboards live
   *  under it (`<root>/<cellId>`). Give each mount a unique key to isolate. */
  storageKey?: string
  /** Custom layout persistence (e.g. IndexedDB, spaces-backed). Default localStorage. */
  persistenceAdapter?: GridPersistenceAdapter
  /** Grid columns for the root dashboard. Default 6. */
  columns?: number
  theme?: MuralProviderProps['theme']
  tokens?: MuralProviderProps['tokens']
  /** Who is using the board — attribution in shared spaces + calendar events. */
  user?: MuralUser
  /** Remote storage spaces (company server) offered beside local. */
  spaces?: MuralSpacesConfig
}

// The module's full app, opened over the grid when a cell is expanded.
function AppModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = MODULE_TITLES[moduleId] ?? moduleId
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 355, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 900, maxWidth: '94vw', height: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--border-strong, var(--border))', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {moduleId === 'notes' && <NotesApp />}
          {moduleId === 'contacts' && <ContactsApp />}
          {moduleId === 'reminders' && <RemindersApp />}
          {moduleId === 'calendar' && <CalendarBoard />}
        </div>
      </div>
    </div>
  )
}

const MODULE_TITLES: Record<string, string> = {
  notes: 'Notas', contacts: 'Contactos', reminders: 'Recordatorios', calendar: 'Calendario',
}

// Full-screen markdown editor overlay for a text cell. Debounces writes ~400ms.
function TextEditModal({ initial, onChange, onClose }: { initial: string; onChange: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleChange(next: string) {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(next), 400)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div
      onClick={() => { onChange(text); onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 360, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: '92vw', height: 520, maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong, var(--border))', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
          <MarkdownEditor value={text} onChange={handleChange} autoFocus placeholder="Escribe…" />
        </div>
      </div>
    </div>
  )
}

// Floating breadcrumb shown inside a sub-dashboard. Click a crumb to pop to it.
function Breadcrumb({ stack, onGo }: { stack: Crumb[]; onGo: (index: number) => void }) {
  return (
    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontSize: 12 }}>
      {stack.map((crumb, i) => {
        const last = i === stack.length - 1
        return (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
            <button
              onClick={() => !last && onGo(i)}
              disabled={last}
              style={{ border: 'none', background: 'transparent', color: last ? 'var(--fg)' : 'var(--fg-dim)', fontWeight: last ? 600 : 400, cursor: last ? 'default' : 'pointer', padding: '2px 4px', fontSize: 12 }}
            >
              {crumb.title}
            </button>
          </span>
        )
      })}
    </div>
  )
}

function DashboardShell({
  storageKey,
  persistenceAdapter,
  columns,
}: {
  storageKey: string
  persistenceAdapter: GridPersistenceAdapter
  columns: number
}) {
  const registry = useMemo(() => buildEmbedRegistry(), [])

  const [editMode, setEditMode] = useState(false)
  const [addSlot, setAddSlot] = useState<{ col: number; row: number; cols?: number; rows?: number } | null>(null)
  const [stack, setStack] = useState<Crumb[]>([{ id: storageKey, title: 'Inicio' }])
  const [openApp, setOpenApp] = useState<string | null>(null)
  const [editTextCell, setEditTextCell] = useState<string | null>(null)
  const [configTarget, setConfigTarget] = useState<{ cellId: string; tabId?: string } | null>(null)
  const [, setTick] = useState(0)

  const current = stack[stack.length - 1] ?? { id: storageKey, title: 'Inicio' }

  const layoutRef = useRef<{ cells: GridCellRecord[]; applyCells: (cells: GridCellRecord[]) => void } | null>(null)

  function updateCell(cellId: string, patch: Partial<GridCellRecord>) {
    const cur = layoutRef.current
    if (!cur) return
    cur.applyCells(
      cur.cells.map((c) =>
        c.id === cellId ? { ...c, ...patch, props: patch.props ? { ...c.props, ...patch.props } : c.props } : c,
      ),
    )
    setTick((t) => t + 1)
  }

  function handleRemove(cellId: string) {
    const cur = layoutRef.current
    if (!cur) return
    cur.applyCells(cur.cells.filter((c) => c.id !== cellId))
    setConfigTarget((t) => (t?.cellId === cellId ? null : t))
    setTick((t) => t + 1)
  }

  function openConfigTab(cellId: string, tabId?: string) {
    setConfigTarget({ cellId, tabId })
  }

  const ctx: CellContext = useMemo(
    () => ({
      openModal: (moduleId: string) => setOpenApp(moduleId),
      layoutId: current.id,
      navigateTo: (id: string, title?: string) => {
        setAddSlot(null)
        setStack((s) => [...s, { id, title: title || 'Dashboard' }])
      },
      updateCell,
      openTextEditor: (cellId: string) => setEditTextCell(cellId),
    }),
    [current.id],
  )

  function renderCell(cell: GridCellRecord, isDragging: boolean) {
    return registry.render(cell, ctx, isDragging)
  }

  function handleResize(cellId: string, size: GridSize) {
    const cur = layoutRef.current
    if (!cur) return
    cur.applyCells(cur.cells.map((c) => (c.id === cellId ? { ...c, size } : c)))
  }

  function slotSize(fallback: GridSize): GridSize {
    if (addSlot?.cols && addSlot?.rows) return `${addSlot.cols}x${addSlot.rows}`
    return fallback
  }

  function newCellId() {
    return `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  function handlePick(descriptor: ModuleDescriptor) {
    const cur = layoutRef.current
    if (!cur || !addSlot) return
    const size = slotSize(descriptor.defaultSize)
    cur.applyCells([...cur.cells, {
      id: newCellId(), moduleId: descriptor.moduleId, viewSpecId: `${descriptor.moduleId}/${size}`, size,
      position: { col: addSlot.col, row: addSlot.row },
    }])
    setAddSlot(null)
  }

  function handleCreateNote(text: string) {
    const cur = layoutRef.current
    if (!cur || !addSlot) return
    const size = slotSize('2x1')
    cur.applyCells([...cur.cells, {
      id: newCellId(), moduleId: 'text', viewSpecId: `text/${size}`, size,
      position: { col: addSlot.col, row: addSlot.row }, props: { text },
    }])
    setAddSlot(null)
  }

  function isMethodVisible(m: CellMethod, cell: GridCellRecord): boolean {
    const v = m.visibility
    const mode = v?.mode ?? 'edit'
    if (mode !== 'both' && mode !== (editMode ? 'edit' : 'view')) return false
    const span = sizeSpan(cell.size)
    if (v?.match && !v.match(span)) return false
    if (v?.minSizes && !v.minSizes.some((s) => {
      const b = sizeSpan(s)
      return span.cols >= b.cols && span.rows >= b.rows
    })) return false
    return true
  }

  function getCellMenu(cell: GridCellRecord): CellMenuItem[] {
    const items: CellMenuItem[] = [
      { id: 'grid.size', label: 'Tamaño…', icon: '⤢', group: 'grid', onSelect: () => openConfigTab(cell.id, 'size') },
      { id: 'grid.onclick', label: 'On click…', icon: '👆', group: 'grid', onSelect: () => openConfigTab(cell.id, 'onClick') },
      { id: 'grid.remove', label: 'Eliminar', icon: '🗑', group: 'grid', danger: true, onSelect: () => handleRemove(cell.id) },
    ]
    for (const m of registry.getMethods(cell.moduleId)) {
      if (!isMethodVisible(m, cell)) continue
      items.push({
        id: `m.${m.id}`, label: m.label, icon: m.icon, group: 'module',
        onSelect: () => (m.tab ? openConfigTab(cell.id, m.tab.id) : m.run?.(cell, ctx)),
      })
    }
    return items
  }

  function resolveCellClick(cell: GridCellRecord): (() => void) | undefined {
    const binding = cell.props?.['onClick'] as OnClickBinding | undefined
    if (!binding) {
      const def = registry.getDefaultMethod(cell.moduleId)
      return def?.run ? () => def.run!(cell, ctx) : undefined
    }
    switch (binding.kind) {
      case 'none': return undefined
      case 'method': {
        const m = registry.getMethods(cell.moduleId).find((x) => x.id === binding.methodId)
        return m?.run ? () => m.run!(cell, ctx) : undefined
      }
      case 'openModal': return () => ctx.openModal?.(binding.moduleId ?? cell.moduleId)
      case 'navigate': return () => ctx.navigateTo?.(binding.layoutId, binding.title)
      case 'url': return () => window.open(binding.url, '_blank', 'noopener')
    }
  }

  function tabsForCell(cell: GridCellRecord): CellTab[] {
    const mod = registry.getModule(cell.moduleId)
    const methods = registry.getMethods(cell.moduleId)
    const def = registry.getDefaultMethod(cell.moduleId)
    const tabs: CellTab[] = [
      makeOnClickTab({ methods, defaultLabel: def ? `${def.icon ? def.icon + ' ' : ''}${def.label}` : 'No hacer nada' }),
      makeSizeTab(mod?.descriptor.availableSizes ?? ['1x1', '2x1', '1x2', '2x2']),
      ...(mod?.tabs ?? []),
      ...methods.flatMap((m) => (m.tab ? [m.tab] : [])),
    ]
    const seen = new Set<string>()
    return tabs.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
  }

  const configCell = configTarget ? layoutRef.current?.cells.find((c) => c.id === configTarget.cellId) : undefined

  const rootConfig: Partial<GridLayoutConfig> =
    current.id === storageKey ? { columns, cellSize: 160, gap: 12, cells: [] } : { columns, cellSize: 160, gap: 12 }

  return (
    <div style={{ height: '100%', minHeight: 0, position: 'relative' }}>
      <ShellApp
        key={current.id}
        dockItems={[]}
        hideSidebar
        layoutId={current.id}
        initialConfig={current.id === storageKey ? rootConfig : undefined}
        platform="web"
        persistenceAdapter={persistenceAdapter}
        renderCell={renderCell}
        editMode={editMode}
        onEnterEditMode={() => setEditMode(true)}
        onCellResize={handleResize}
        onCellEditClick={(cellId) => openConfigTab(cellId)}
        onAddElement={(col, row, cols, rows) => setAddSlot({ col, row, cols, rows })}
        getCellMenu={getCellMenu}
        resolveCellClick={resolveCellClick}
        layoutRef={layoutRef}
      />

      {/* Edit toggle — the drawer host has no dock, so surface it here. */}
      <button
        onClick={() => setEditMode((v) => !v)}
        title={editMode ? 'Salir de edición' : 'Editar tablero'}
        style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 300, width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border)', background: editMode ? 'var(--accent)' : 'var(--bg-elevated)', color: editMode ? '#fff' : 'var(--fg-dim)', cursor: 'pointer', fontSize: 16, boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}
      >
        {editMode ? '✓' : '✎'}
      </button>

      {stack.length > 1 && (
        <Breadcrumb stack={stack} onGo={(i) => { setAddSlot(null); setStack((s) => s.slice(0, i + 1)) }} />
      )}

      {addSlot && (
        <WebAddElementModal
          descriptors={registry.list().filter((d) => !d.hiddenFromPicker)}
          onPick={handlePick}
          onCreateNote={handleCreateNote}
          onClose={() => setAddSlot(null)}
        />
      )}

      {openApp && <AppModal moduleId={openApp} onClose={() => setOpenApp(null)} />}

      {editTextCell && (
        <TextEditModal
          initial={(layoutRef.current?.cells.find((c) => c.id === editTextCell)?.props?.['text'] as string) ?? ''}
          onChange={(text) => updateCell(editTextCell, { props: { text } })}
          onClose={() => setEditTextCell(null)}
        />
      )}

      {configTarget && configCell && (
        <WidgetConfigModal
          cell={configCell}
          ctx={ctx}
          tabs={tabsForCell(configCell)}
          initialTabId={configTarget.tabId}
          onUpdate={(patch) => updateCell(configCell.id, patch)}
          onRemove={() => handleRemove(configCell.id)}
          onClose={() => setConfigTarget(null)}
        />
      )}
    </div>
  )
}

export function MuralDashboard({
  storageKey = 'elio-dashboard',
  persistenceAdapter = localStorageAdapter,
  columns = 6,
  theme,
  tokens,
  user,
  spaces,
}: MuralDashboardProps) {
  return (
    <MuralProvider theme={theme} tokens={tokens} user={user} spaces={spaces} style={{ height: '100%' }}>
      <DashboardShell storageKey={storageKey} persistenceAdapter={persistenceAdapter} columns={columns} />
    </MuralProvider>
  )
}
