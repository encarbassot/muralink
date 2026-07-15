import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShellApp, CellRegistry, type CellContext, type ModuleDescriptor } from '@muralink/shell'
import type { GridCellRecord, GridSize } from '@muralink/types'
import { usePlatform } from '@/stores/platformStore'
import { useDock } from '@/stores/dockStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { usePinned } from '@/stores/pinnedStore'
import { defaultLayout } from './defaultLayout'
import { ELECTRON_CELLS } from './cells'
import { CellConfigModal } from './CellConfigModal'
import { AddElementModal } from './AddElementModal'

export function DashboardApp() {
  const openApp = usePlatform((s) => s.openApp)
  const toggleAppsDrawer = usePlatform((s) => s.toggleAppsDrawer)
  const goToDrawer = usePlatform((s) => s.goToDrawer)
  const setDockItems = useDock((s) => s.setItems)

  const currentLayoutId = useLayoutStore((s) => s.currentLayoutId())
  const navigationStack = useLayoutStore((s) => s.navigationStack)
  const navigateBack = useLayoutStore((s) => s.navigateBack)
  const navigateToRoot = useLayoutStore((s) => s.navigateToRoot)
  const navigateTo = useLayoutStore((s) => s.navigateTo)
  const createLayout = useLayoutStore((s) => s.createLayout)

  // Shared cell registry — replaces the old hardcoded renderCell switch.
  const registry = useMemo(() => {
    const r = new CellRegistry()
    r.registerAll(ELECTRON_CELLS)
    return r
  }, [])
  const cellCtx: CellContext = useMemo(
    () => ({ openApp, goToDrawer, navigateTo }),
    [openApp, goToDrawer, navigateTo],
  )

  const [editMode, setEditMode] = useState(false)
  const [configCellId, setConfigCellId] = useState<string | null>(null)
  const [addSlot, setAddSlot] = useState<{ col: number; row: number } | null>(null)

  const layoutRef = useRef<{
    cells: GridCellRecord[]
    applyCells: (cells: GridCellRecord[]) => void
  } | null>(null)

  const isAtRoot = navigationStack.length <= 1
  const layouts = useLayoutStore((s) => s.layouts)

  const pinItem = usePinned((s) => s.pinItem)
  const isPinnedFn = usePinned((s) => s.isPinned)
  const unpinItem = usePinned((s) => s.unpinItem)
  const pinnedItems = usePinned((s) => s.items)

  const currentLayoutMeta = layouts[currentLayoutId]
  const alreadyPinned = isPinnedFn(currentLayoutId, 'layout')
  const pinnedEntry = alreadyPinned
    ? pinnedItems.find((i) => i.path === currentLayoutId && i.type === 'layout')
    : null

  const handlePinToggle = useCallback(() => {
    if (alreadyPinned && pinnedEntry) {
      unpinItem(pinnedEntry.id)
    } else {
      const label = isAtRoot ? 'Dashboard' : (currentLayoutMeta?.label ?? 'Folder')
      const icon = isAtRoot ? '⊞' : (currentLayoutMeta?.icon ?? '📂')
      pinItem(currentLayoutId, label, icon, undefined, 'layout')
    }
  }, [alreadyPinned, pinnedEntry, isAtRoot, currentLayoutMeta, currentLayoutId, pinItem, unpinItem])

  // Register dock items — updates when sub-layout navigation or pin state changes
  useEffect(() => {
    const pinButton = {
      type: 'button' as const,
      id: 'pin',
      icon: (
        <span style={{ fontSize: 14, lineHeight: 1, color: alreadyPinned ? 'var(--accent)' : undefined }}>
          {alreadyPinned ? '📌' : '📍'}
        </span>
      ),
      label: alreadyPinned ? 'Unpin this view' : 'Pin this view',
      onClick: handlePinToggle,
      active: alreadyPinned,
    }

    const items = isAtRoot
      ? [
          {
            type: 'button' as const,
            id: 'apps',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>⊞</span>,
            label: 'Apps',
            onClick: toggleAppsDrawer,
          },
          {
            type: 'button' as const,
            id: 'files',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>📁</span>,
            label: 'Files',
            onClick: () => openApp('files'),
          },
          {
            type: 'button' as const,
            id: 'orchester',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🎛</span>,
            label: 'Orchester',
            onClick: () => openApp('orchester'),
          },
          pinButton,
        ]
      : [
          {
            type: 'button' as const,
            id: 'back',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>,
            label: 'Back',
            onClick: navigateBack,
          },
          {
            type: 'button' as const,
            id: 'home',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>⌂</span>,
            label: 'Dashboard',
            onClick: navigateToRoot,
          },
          {
            type: 'button' as const,
            id: 'orchester',
            icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🎛</span>,
            label: 'Orchester',
            onClick: () => openApp('orchester'),
          },
          pinButton,
        ]
    setDockItems(items)
  }, [setDockItems, toggleAppsDrawer, openApp, isAtRoot, navigateBack, navigateToRoot, alreadyPinned, handlePinToggle])

  // Escape exits config modal → edit mode (in order)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (addSlot) { setAddSlot(null); return }
      if (configCellId) { setConfigCellId(null); return }
      setEditMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [configCellId, addSlot])

  const configCell = configCellId
    ? layoutRef.current?.cells.find((c) => c.id === configCellId) ?? null
    : null

  function handleResize(cellId: string, size: GridSize) {
    const current = layoutRef.current
    if (!current) return
    current.applyCells(
      current.cells.map((c) => (c.id === cellId ? { ...c, size } : c)),
    )
  }

  function handleRemove(cellId: string) {
    const current = layoutRef.current
    if (!current) return
    current.applyCells(current.cells.filter((c) => c.id !== cellId))
  }

  function handleCellResize(cellId: string, size: GridSize) {
    handleResize(cellId, size)
  }

  function handleAddElement(descriptor: ModuleDescriptor, col: number, row: number) {
    const current = layoutRef.current
    if (!current) return

    let instanceId: string | undefined
    let finalModuleId = descriptor.moduleId

    if (descriptor.moduleId === 'layout') {
      instanceId = createLayout({ label: 'Folder', icon: '📂', parentId: currentLayoutId })
    }

    const newCell: GridCellRecord = {
      id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      viewSpecId: `${finalModuleId}/${descriptor.defaultSize}`,
      moduleId: finalModuleId,
      instanceId,
      size: descriptor.defaultSize,
      position: { col, row },
    }

    current.applyCells([...current.cells, newCell])
  }

  function renderCell(cell: GridCellRecord, isDragging: boolean) {
    return registry.render(cell, cellCtx, isDragging)
  }

  // Re-key ShellApp when the layout changes so useGridLayout reloads cells from storage
  const shellKey = currentLayoutId

  // Initial config for sub-layouts: empty cells (fresh layout)
  const currentInitialConfig =
    currentLayoutId === defaultLayout.layoutId
      ? defaultLayout
      : { ...defaultLayout, layoutId: currentLayoutId, cells: [] }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <ShellApp
        key={shellKey}
        dockItems={[]}
        hideSidebar
        layoutId={currentLayoutId}
        initialConfig={currentInitialConfig}
        platform="electron"
        renderCell={renderCell}
        editMode={editMode}
        onEnterEditMode={() => setEditMode(true)}
        onCellEditClick={(id) => { setConfigCellId(id) }}
        onCellResize={handleCellResize}
        onAddElement={(col, row) => { setAddSlot({ col, row }) }}
        layoutRef={layoutRef}
      />

      {/* Sub-layout breadcrumb banner */}
      {!isAtRoot && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 12,
            gap: 6,
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            zIndex: 50,
            fontSize: 11,
          }}
        >
          <button
            onClick={navigateBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 5,
            }}
          >
            ← Back
          </button>
          <span style={{ color: 'var(--fg-faint)' }}>/</span>
          {navigationStack.map((id, i) => (
            <span key={id} style={{ color: i === navigationStack.length - 1 ? 'var(--fg)' : 'var(--fg-faint)' }}>
              {i === 0 ? 'Dashboard' : id}
            </span>
          ))}
        </div>
      )}

      {/* Config modal */}
      {configCell && (
        <CellConfigModal
          cell={configCell}
          onClose={() => setConfigCellId(null)}
          onRemove={() => handleRemove(configCell.id)}
          onResize={(size) => handleResize(configCell.id, size)}
        />
      )}

      {/* Add element modal */}
      {addSlot && (
        <AddElementModal
          col={addSlot.col}
          row={addSlot.row}
          descriptors={registry.list()}
          onAdd={handleAddElement}
          onClose={() => setAddSlot(null)}
        />
      )}
    </div>
  )
}
