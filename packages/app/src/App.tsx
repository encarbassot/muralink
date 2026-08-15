import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MarkdownEditor } from '@muralink/module-notes/web'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellApp, type CellContext, type ModuleDescriptor, type ModuleVariant, type CellMethod, type CellTab, type OnClickBinding, type GridLayoutHandle } from '@muralink/shell'
import type { GridCellPosition, GridCellRecord, GridSize, LayoutConstraints } from '@muralink/types'
import { localStorageAdapter, makeCloudLayoutAdapter, makeVaultSync, sizeSpan, type CellMenuItem } from '@muralink/ui'
import { setAmbientSpace, type SpaceId } from '@muralink/spaces'
import { PublicBooking } from './pages/PublicBooking.tsx'
import { buildWebRegistry } from './registry.tsx'
import { pinnedDockItems } from './pinnedDockItems.tsx'
import { seedWelcomeMural } from './seedWelcome.ts'
import { defaultLayout, WEB_LAYOUT_ID } from './defaultLayout.ts'
import { useView, DASHBOARD } from './viewStore.ts'
import { AppPanel } from './modals.tsx'
import { WebAddElementModal } from './WebAddElementModal.tsx'
import type { OmnibarContext } from '@muralink/omnibar'
import { WidgetConfigModal } from './WidgetConfigModal.tsx'
import { makeOnClickTab } from './widgetTabs/OnClickTab.tsx'
import { makeSizeTab } from './widgetTabs/SizeTab.tsx'
import { type AppEnv, AppEnvProvider, defaultEnv } from './env.ts'
import { configureApi } from './api/client.ts'
import { ChatBubble } from './chat/ChatBubble.tsx'
// Design tokens (CSS variables) must load before everything that reads them.
import './styles/tokens.css'
import './styles/module-views.css'
import './styles/base.css'
import './styles/chat.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

interface Crumb {
  id: string
  title: string
  // Effective storage space for items created while in this dashboard. Resolved
  // on navigation: a sub-dashboard inherits its parent unless its cell overrides
  // it (cell.props.storageSpace). Root baseline is 'local'.
  space: SpaceId
}

// A dashboard cell's storage setting, stored on cell.props.storageSpace.
// 'inherit' (or absent) = cascade from the parent dashboard.
type StorageChoice = SpaceId | 'inherit'
const ROOT_SPACE: SpaceId = 'local'

function WebShell({ env }: { env: AppEnv }) {
  const registry = useMemo(() => buildWebRegistry(), [])
  const view = useView((s) => s.view)
  const instanceId = useView((s) => s.instanceId)
  const setView = useView((s) => s.setView)

  // Focus/outfocus model (replaces the deprecated global edit mode): the one
  // focused cell is interactive + shows move/resize chrome; all others read-only.
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null)
  // A pending add: position (col,row) plus optional marquee-defined span (cols,rows).
  // `context` carries where the omnibar was invoked from (selection, grid slot…).
  const [addSlot, setAddSlot] = useState<{ col: number; row: number; cols?: number; rows?: number; context?: OmnibarContext } | null>(null)
  // Recursive dashboards: a stack of nested grids. The last entry is the one shown.
  const [stack, setStack] = useState<Crumb[]>([{ id: WEB_LAYOUT_ID, title: 'Inicio', space: ROOT_SPACE }])
  // The text cell whose full-screen editor overlay is open, if any.
  const [editTextCell, setEditTextCell] = useState<string | null>(null)
  // The widget-config modal target (cell + optional starting tab), if open.
  const [configTarget, setConfigTarget] = useState<{ cellId: string; tabId?: string } | null>(null)
  // Bumped on every cell mutation so views reading the layout ref re-render.
  const [, setTick] = useState(0)

  const current = stack[stack.length - 1] ?? { id: WEB_LAYOUT_ID, title: 'Inicio', space: ROOT_SPACE }

  // Route new items to the active dashboard's effective space (cascade). Reads
  // still merge every active space; this only steers where new items are created.
  useEffect(() => {
    setAmbientSpace(current.space)
  }, [current.space])

  // First run on this device: the seeded dashboard shows a murales card, so
  // give it something to show. Fire-and-forget — a failed seed must never stop
  // the app from opening.
  useEffect(() => {
    void seedWelcomeMural()
  }, [])

  // A vault subtree (layoutId prefixed `vault:`) persists its grid to the account
  // cloud core instead of localStorage, so it converges across devices. The cloud
  // adapter is built once from the app env (base URL + account token). Realtime
  // push (useVaultSync) is wired into `subscribe` in a later step; until then the
  // vault still syncs pull-wise on open.
  // One WebSocket to /ws/vault backs all vault subtrees; its `subscribe` feeds the
  // adapter so a change on another device refetches here in realtime. Reconnect
  // triggers a full resync. Closed on unmount.
  const vaultSync = useMemo(
    () => makeVaultSync({ baseUrl: env.apiBaseUrl, token: env.apiToken }),
    [env.apiBaseUrl, env.apiToken],
  )
  useEffect(() => () => vaultSync.close(), [vaultSync])
  const cloudLayoutAdapter = useMemo(
    () => makeCloudLayoutAdapter({ baseUrl: env.apiBaseUrl, token: env.apiToken, subscribe: vaultSync.subscribe }),
    [env.apiBaseUrl, env.apiToken, vaultSync],
  )
  const isVault = current.id.startsWith('vault:')

  const layoutRef = useRef<GridLayoutHandle | null>(null)

  // Module-level layout constraints, fed to the auto layout so the grid can act
  // as a window manager (a "tall" calendar stays tall, etc.).
  const resolveConstraints = useMemo(
    () => (cell: GridCellRecord): LayoutConstraints | undefined =>
      registry.getConstraints(cell.moduleId),
    [registry],
  )

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

  // Global open shortcut (Cmd/Ctrl+K): snapshot the current text selection and
  // open the omnibar seeded with it — select text in a note → ⌘K → "tr" translates.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.key === 'k' && (e.metaKey || e.ctrlKey))) return
      if (view !== DASHBOARD) return
      e.preventDefault()
      const text = window.getSelection()?.toString().trim() || undefined
      setAddSlot({
        col: 0,
        row: 0,
        context: { source: text ? 'selection' : 'none', text },
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  function handleRemove(cellId: string) {
    const cur = layoutRef.current
    if (!cur) return
    // Semantic delete: compacts the hole in auto mode, plain remove in freeform.
    cur.deleteCell(cellId)
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
        setFocusedCellId(null)
        // Resolve the child dashboard's effective space: its own setting if it
        // overrides, else inherit the parent's (cascade).
        const childId = id.split('/').pop()
        const choice = layoutRef.current?.cells.find((c) => c.id === childId)
          ?.props?.storageSpace as StorageChoice | undefined
        const space: SpaceId = choice && choice !== 'inherit' ? choice : current.space
        setStack((s) => [...s, { id, title: title || 'Dashboard', space }])
      },
      updateCell,
      openTextEditor: (cellId: string) => setEditTextCell(cellId),
      focusCell: (cellId: string) => {
        setFocusedCellId(cellId)
        document.querySelector(`[data-cell-id="${cellId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      },
    }),
    [setView, current.id],
  )

  const dockItems = [
    ...pinnedDockItems(layoutRef.current?.cells ?? [], registry, ctx, focusedCellId ?? undefined),
    ...(env.dockItems ?? []),
  ]

  function renderCell(cell: GridCellRecord, isDragging: boolean) {
    // Per-cell ctx: only the focused cell is interactive; others render read-only.
    return registry.render(cell, { ...ctx, focused: cell.id === focusedCellId }, isDragging)
  }

  function handleResize(cellId: string, size: GridSize, position?: GridCellPosition) {
    const cur = layoutRef.current
    if (!cur) return
    // Semantic resize: grow now displaces neighbors (freeform) or reflows all (auto)
    // instead of silently overlapping. `position` moves the origin when a top/left
    // handle was dragged.
    cur.resizeCell(cellId, size, position)
  }

  // Marquee-defined span wins; otherwise fall back to the descriptor's default.
  function slotSize(fallback: GridSize): GridSize {
    if (addSlot?.cols && addSlot?.rows) return `${addSlot.cols}x${addSlot.rows}`
    return fallback
  }

  function newCellId() {
    return `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  function handlePick(descriptor: ModuleDescriptor, variant?: ModuleVariant) {
    const cur = layoutRef.current
    if (!cur || !addSlot) return
    const size = slotSize(variant?.defaultSize ?? descriptor.defaultSize)
    const newCell: GridCellRecord = {
      id: newCellId(),
      moduleId: descriptor.moduleId,
      viewSpecId: `${descriptor.moduleId}/${size}`,
      size,
      position: { col: addSlot.col, row: addSlot.row },
      props: variant?.defaultProps ? { ...variant.defaultProps } : undefined,
    }
    // Semantic insert: auto-places + reflows in auto mode, displaces overlaps in
    // freeform (no more stacking a new widget on top of an existing one).
    cur.insertCell(newCell)
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
    cur.insertCell(newCell)
    setAddSlot(null)
  }

  // Is a module method available on this cell right now (size gate)? The mode
  // gate is dropped with edit-mode deprecation — the ⋯ menu only renders on the
  // focused cell, which is the interactive context.
  function isMethodVisible(m: CellMethod, cell: GridCellRecord): boolean {
    const v = m.visibility
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
      {
        id: 'grid.pin',
        label: cell.pinned ? 'Desanclar del dock' : 'Anclar al dock',
        icon: '📌',
        group: 'grid',
        onSelect: () => updateCell(cell.id, { pinned: !cell.pinned }),
      },
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
    // Sub-dashboards carry a storage setting that cascades to everything created
    // inside them (and their own sub-dashboards). 'inherit' follows the parent.
    if (cell.moduleId === 'dashboard') {
      const choice = (cell.props?.storageSpace as StorageChoice | undefined) ?? 'inherit'
      const opt = (id: StorageChoice, label: string, icon: string): CellMenuItem => ({
        id: `store.${id}`,
        label: (choice === id ? '● ' : '') + label,
        icon,
        group: 'module',
        onSelect: () => updateCell(cell.id, { props: { storageSpace: id } }),
      })
      items.push(
        opt('inherit', 'Guardar: heredar', '⤴'),
        opt('local', 'Guardar: local', '💾'),
        opt('orchester', 'Guardar: nube', '☁'),
      )
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

  // The dashboard grid is always mounted — opening an app (Mail, Cuentas, a
  // CRUD page, …) no longer navigates away from it. When view !== DASHBOARD,
  // AppPanel renders as a full-screen overlay on top instead of replacing the
  // grid, so every cell's existing "expand" affordance (ctx.openModal = setView)
  // keeps working unchanged — it now opens over the grid rather than instead of it.
  return (
    <div style={{ height: '100vh', position: 'relative' }}>
      {/* Dashboard: the bento grid (dock + grid via ShellApp). Keyed by the active
          layoutId so descending into a sub-dashboard remounts and reloads its cells. */}
      <ShellApp
        key={current.id}
        dockItems={dockItems}
        layoutId={current.id}
        initialConfig={current.id === WEB_LAYOUT_ID ? defaultLayout : undefined}
        platform="web"
        persistenceAdapter={isVault ? cloudLayoutAdapter : localStorageAdapter}
        renderCell={renderCell}
        focusMode
        focusedCellId={focusedCellId}
        onFocusCell={setFocusedCellId}
        onCellResize={handleResize}
        onCellEditClick={(cellId) => openConfigTab(cellId)}
        onAddElement={(col, row, cols, rows) => setAddSlot({ col, row, cols, rows, context: { source: 'slot' } })}
        getCellMenu={getCellMenu}
        resolveCellClick={resolveCellClick}
        resolveConstraints={resolveConstraints}
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
          context={addSlot.context}
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

      {view !== DASHBOARD && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'var(--bg)' }}>
          <AppPanel viewId={view} instanceId={instanceId} onBack={() => setView(DASHBOARD)} />
        </div>
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
            {/* App — bento shell. ChatBubble portals to <body>, so mounting it
                on this route (and not on /book) covers dashboard + app views
                while keeping the public page clean. */}
            <Route
              path="/*"
              element={
                <>
                  <WebShell env={env} />
                  <ChatBubble />
                </>
              }
            />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AppEnvProvider>
  )
}
