import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MarkdownEditor } from '@muralink/module-notes/web'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellApp, Dock, type CellContext, type ModuleDescriptor, type CellMethod, type CellTab, type OnClickBinding } from '@muralink/shell'
import type { GridCellRecord, GridSize } from '@muralink/types'
import { AppShell, localStorageAdapter, sizeSpan, type CellMenuItem } from '@muralink/ui'
import { PublicBooking } from './pages/PublicBooking.tsx'
import { buildWebRegistry } from './registry.tsx'
import { makeWebDockItems } from './dockItems.tsx'
import { defaultLayout, WEB_LAYOUT_ID } from './defaultLayout.ts'
import { useView, DASHBOARD } from './viewStore.ts'
import { AppPanel } from './modals.tsx'
import { WebAddElementModal } from './WebAddElementModal.tsx'
import { WidgetConfigModal } from './WidgetConfigModal.tsx'
import { makeOnClickTab } from './widgetTabs/OnClickTab.tsx'
import { makeSizeTab } from './widgetTabs/SizeTab.tsx'
import { type AppEnv, AppEnvProvider, defaultEnv } from './env.ts'
import { configureApi } from './api/client.ts'
// Design tokens (CSS variables) must load before everything that reads them.
import './styles/tokens.css'
import './styles/module-views.css'
import './styles/base.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

interface Crumb {
  id: string
  title: string
}

function WebShell({ env }: { env: AppEnv }) {
  const registry = useMemo(() => buildWebRegistry(), [])
  const view = useView((s) => s.view)
  const instanceId = useView((s) => s.instanceId)
  const setView = useView((s) => s.setView)

  const [editMode, setEditMode] = useState(false)
  // A pending add: position (col,row) plus optional marquee-defined span (cols,rows).
  const [addSlot, setAddSlot] = useState<{ col: number; row: number; cols?: number; rows?: number } | null>(null)
  // Recursive dashboards: a stack of nested grids. The last entry is the one shown.
  const [stack, setStack] = useState<Crumb[]>([{ id: WEB_LAYOUT_ID, title: 'Inicio' }])
  // The text cell whose full-screen editor overlay is open, if any.
  const [editTextCell, setEditTextCell] = useState<string | null>(null)
  // The widget-config modal target (cell + optional starting tab), if open.
  const [configTarget, setConfigTarget] = useState<{ cellId: string; tabId?: string } | null>(null)
  // Bumped on every cell mutation so views reading the layout ref re-render.
  const [, setTick] = useState(0)

  const current = stack[stack.length - 1] ?? { id: WEB_LAYOUT_ID, title: 'Inicio' }

  const layoutRef = useRef<{
    cells: GridCellRecord[]
    applyCells: (cells: GridCellRecord[]) => void
  } | null>(null)

  function updateCell(cellId: string, patch: Partial<GridCellRecord>) {
    const cur = layoutRef.current
    if (!cur) return
    // Merge props shallowly so a namespaced write (e.g. props.onClick) never
    // clobbers sibling keys (props.text, props.name) and vice-versa.
    cur.applyCells(
      cur.cells.map((c) =>
        c.id === cellId
          ? { ...c, ...patch, props: patch.props ? { ...c.props, ...patch.props } : c.props }
          : c,
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

  // Capabilities each cell may use. openModal switches the main view to an app;
  // navigateTo descends into a sub-dashboard; updateCell persists cell content.
  const ctx: CellContext = useMemo(
    () => ({
      openModal: setView,
      layoutId: current.id,
      navigateTo: (id: string, title?: string) => {
        setAddSlot(null)
        setStack((s) => [...s, { id, title: title || 'Dashboard' }])
      },
      updateCell,
      openTextEditor: (cellId: string) => setEditTextCell(cellId),
    }),
    [setView, current.id],
  )

  const dockItems = makeWebDockItems({
    activeView: view,
    setView,
    editMode,
    onToggleEdit: () => setEditMode((v) => !v),
    hasOrchester: env.hasOrchester,
  })

  function renderCell(cell: GridCellRecord, isDragging: boolean) {
    return registry.render(cell, ctx, isDragging)
  }

  function handleResize(cellId: string, size: GridSize) {
    const cur = layoutRef.current
    if (!cur) return
    cur.applyCells(cur.cells.map((c) => (c.id === cellId ? { ...c, size } : c)))
  }

  // Marquee-defined span wins; otherwise fall back to the descriptor's default.
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
    const newCell: GridCellRecord = {
      id: newCellId(),
      moduleId: descriptor.moduleId,
      viewSpecId: `${descriptor.moduleId}/${size}`,
      size,
      position: { col: addSlot.col, row: addSlot.row },
    }
    cur.applyCells([...cur.cells, newCell])
    setAddSlot(null)
  }

  // Omnibar fallback: typed text matched no widget → drop a simple note holding it.
  function handleCreateNote(text: string) {
    const cur = layoutRef.current
    if (!cur || !addSlot) return
    const size = slotSize('2x1')
    const newCell: GridCellRecord = {
      id: newCellId(),
      moduleId: 'text',
      viewSpecId: `text/${size}`,
      size,
      position: { col: addSlot.col, row: addSlot.row },
      props: { text },
    }
    cur.applyCells([...cur.cells, newCell])
    setAddSlot(null)
  }

  // Is a module method available on this cell right now (size + mode gates)?
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

  // The header ⋯ menu: grid-native options + the module's visible methods.
  function getCellMenu(cell: GridCellRecord): CellMenuItem[] {
    const items: CellMenuItem[] = [
      { id: 'grid.size', label: 'Tamaño…', icon: '⤢', group: 'grid', onSelect: () => openConfigTab(cell.id, 'size') },
      { id: 'grid.onclick', label: 'On click…', icon: '👆', group: 'grid', onSelect: () => openConfigTab(cell.id, 'onClick') },
      { id: 'grid.remove', label: 'Eliminar', icon: '🗑', group: 'grid', danger: true, onSelect: () => handleRemove(cell.id) },
    ]
    for (const m of registry.getMethods(cell.moduleId)) {
      if (!isMethodVisible(m, cell)) continue
      items.push({
        id: `m.${m.id}`,
        label: m.label,
        icon: m.icon,
        group: 'module',
        onSelect: () => (m.tab ? openConfigTab(cell.id, m.tab.id) : m.run?.(cell, ctx)),
      })
    }
    return items
  }

  // Resolve a cell's configured click action for view mode (undefined = not clickable).
  function resolveCellClick(cell: GridCellRecord): (() => void) | undefined {
    const binding = cell.props?.onClick as OnClickBinding | undefined
    if (!binding) {
      const def = registry.getDefaultMethod(cell.moduleId)
      return def?.run ? () => def.run!(cell, ctx) : undefined
    }
    switch (binding.kind) {
      case 'none':
        return undefined
      case 'method': {
        const m = registry.getMethods(cell.moduleId).find((x) => x.id === binding.methodId)
        return m?.run ? () => m.run!(cell, ctx) : undefined
      }
      case 'openModal':
        return () => ctx.openModal?.(binding.moduleId ?? cell.moduleId)
      case 'navigate':
        return () => ctx.navigateTo?.(binding.layoutId, binding.title)
      case 'url':
        return () => window.open(binding.url, '_blank', 'noopener')
    }
  }

  // The config tabs for a cell: built-in On click + Size, then module tabs. Deduped by id.
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

  // An app view fills the main content area; the dock stays visible alongside it.
  if (view !== DASHBOARD) {
    return (
      <div style={{ height: '100vh' }}>
        <AppShell sidebar={<Dock items={dockItems} />}>
          <AppPanel viewId={view} instanceId={instanceId} onBack={() => setView(DASHBOARD)} />
        </AppShell>
      </div>
    )
  }

  // Dashboard: the bento grid (dock + grid via ShellApp). Keyed by the active
  // layoutId so descending into a sub-dashboard remounts and reloads its cells.
  return (
    <div style={{ height: '100vh', position: 'relative' }}>
      <ShellApp
        key={current.id}
        dockItems={dockItems}
        layoutId={current.id}
        initialConfig={current.id === WEB_LAYOUT_ID ? defaultLayout : undefined}
        platform="web"
        persistenceAdapter={localStorageAdapter}
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

      {editTextCell && (
        <TextEditModal
          initial={(layoutRef.current?.cells.find((c) => c.id === editTextCell)?.props?.text as string) ?? ''}
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

// Floating path bar shown when inside a sub-dashboard. Click a crumb to pop up to it.
function Breadcrumb({ stack, onGo }: { stack: Crumb[]; onGo: (index: number) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        borderRadius: 10,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        fontSize: 12,
      }}
    >
      {stack.map((crumb, i) => {
        const last = i === stack.length - 1
        return (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
            <button
              onClick={() => !last && onGo(i)}
              disabled={last}
              style={{
                border: 'none',
                background: 'transparent',
                color: last ? 'var(--fg)' : 'var(--fg-dim)',
                fontWeight: last ? 600 : 400,
                cursor: last ? 'default' : 'pointer',
                padding: '2px 4px',
                fontSize: 12,
              }}
            >
              {crumb.title}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// Full-screen text editor overlay. Reuses the notes "bloc de notas" MarkdownEditor.
// Debounces writes back to the cell (~400ms) like NotesApp does.
function TextEditModal({ initial, onChange, onClose }: { initial: string; onChange: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleChange(next: string) {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(next), 400)
  }

  // Flush any pending change on close.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div
      onClick={() => { onChange(text); onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 360,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: '92vw',
          height: 520,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong, var(--border))',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
          <MarkdownEditor value={text} onChange={handleChange} autoFocus placeholder="Escribe…" />
        </div>
      </div>
    </div>
  )
}

export function App({ env = defaultEnv }: { env?: AppEnv }) {
  // Configure the API client for this platform before anything renders.
  useMemo(() => configureApi(env), [env])

  return (
    <AppEnvProvider value={env}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public — no shell */}
            <Route path="/book" element={<PublicBooking />} />
            {/* App — bento shell */}
            <Route path="/*" element={<WebShell env={env} />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AppEnvProvider>
  )
}
