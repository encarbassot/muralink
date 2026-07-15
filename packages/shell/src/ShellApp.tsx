import type React from 'react'
import { useState, useEffect } from 'react'
import {
  AppShell,
  GridCanvas,
  GridConfigPanel,
  useGridLayout,
  localStorageAdapter,
} from '@muralink/ui'
import type { CellMenuItem } from '@muralink/ui'
import type { GridCellRecord, GridLayoutConfig, Platform } from '@muralink/types'
import type { ShellAppProps } from './types.js'
import { Dock } from './Dock.js'

function makeDefaultLayout(layoutId: string, platform: Platform): GridLayoutConfig {
  return {
    layoutId,
    platform,
    columns: 6,
    cellSize: 160,
    gap: 12,
    cells: [],
  }
}

interface Props extends ShellAppProps {
  renderCell: (cell: GridCellRecord, isDragging: boolean) => React.ReactNode
  initialConfig?: Partial<GridLayoutConfig>
  platform?: Platform
  hideSidebar?: boolean
  /** Puts the grid into edit mode (drag handles + pencil buttons). */
  editMode?: boolean
  /** Called when user clicks an empty grid slot. */
  onEnterEditMode?: () => void
  /** Called when a cell's pencil config button is clicked. */
  onCellEditClick?: (cellId: string) => void
  /** Called when corner resize handle commits a new size. */
  onCellResize?: (cellId: string, newSize: import('@muralink/types').GridSize) => void
  /** Called to add an element: (col,row) for a click, (col,row,cols,rows) for a marquee drag. */
  onAddElement?: (col: number, row: number, cols?: number, rows?: number) => void
  /** Header ⋯ menu items for a cell (grid options + module methods). */
  getCellMenu?: (cell: GridCellRecord) => CellMenuItem[]
  /** Resolves a cell's configured view-mode click action. undefined = not clickable. */
  resolveCellClick?: (cell: GridCellRecord) => (() => void) | undefined
  layoutRef?: React.MutableRefObject<{
    cells: GridCellRecord[]
    applyCells: (cells: GridCellRecord[]) => void
  } | null>
}

export function ShellApp({
  dockItems,
  layoutId,
  persistenceAdapter,
  renderCell,
  initialConfig,
  platform = 'web',
  hideSidebar = false,
  editMode = false,
  onEnterEditMode,
  onCellEditClick,
  onCellResize,
  onAddElement,
  getCellMenu,
  resolveCellClick,
  layoutRef,
}: Props) {
  const [showConfig, setShowConfig] = useState(false)

  const defaultLayout: GridLayoutConfig = {
    ...makeDefaultLayout(layoutId, platform),
    ...initialConfig,
    layoutId,
    platform: (initialConfig?.platform ?? platform),
  }

  const { layout, applyCells, updateConfig } = useGridLayout(
    defaultLayout,
    persistenceAdapter ?? localStorageAdapter,
  )

  // Keep layoutRef in sync so callers can read/write cells from outside
  useEffect(() => {
    if (layoutRef) layoutRef.current = { cells: layout.cells, applyCells }
  })

  const configButton = {
    type: 'button' as const,
    id: '__grid-config',
    icon: <span style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>,
    label: 'Grid settings',
    onClick: () => setShowConfig((v) => !v),
    active: showConfig,
  }

  const allDockItems = [...dockItems, configButton]

  return (
    <AppShell
      shellGap={0}
      sidebar={hideSidebar ? undefined : <Dock items={allDockItems} />}
      style={{ height: '100%', boxSizing: 'border-box' }}
    >
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: 16 }}>
        {showConfig && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 12,
            }}
          >
            <GridConfigPanel
              config={layout}
              onChange={updateConfig}
              onClose={() => setShowConfig(false)}
            />
          </div>
        )}
        <GridCanvas
          layout={layout}
          onCellsUpdate={applyCells}
          renderCell={renderCell}
          editMode={editMode}
          onEnterEditMode={onEnterEditMode}
          onCellEditClick={onCellEditClick}
          onCellResize={onCellResize}
          onAddElement={onAddElement}
          getCellMenu={getCellMenu}
          resolveCellClick={resolveCellClick}
        />
      </div>
    </AppShell>
  )
}
