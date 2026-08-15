import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  GridCellRecord,
  GridCellPosition,
  GridLayoutConfig,
  GridPersistenceAdapter,
  GridSize,
  LayoutMode,
} from '@muralink/types'
import {
  autoPack as autoPackCells,
  insertCell as insertCellInto,
  removeCell as removeCellFrom,
  resizeCell as resizeCellIn,
  type ConstraintResolver,
} from '../grid/autolayout.js'

export interface UseGridLayoutReturn {
  layout: GridLayoutConfig
  moveCell: (cellId: string, pos: GridCellPosition) => void
  /** Apply a full updated cell array from DisplacementPlanner in one state update. */
  applyCells: (updatedCells: GridCellRecord[]) => void
  updateConfig: (patch: Partial<Pick<GridLayoutConfig, 'columns' | 'cellSize' | 'gap' | 'layoutMode'>>) => void
  addCell: (cell: Omit<GridCellRecord, 'id'>) => GridCellRecord
  removeCell: (cellId: string) => void
  // ── Window-manager mutators (honor layoutMode + constraints) ──────────────────
  /** Insert a fully-formed cell with auto-placement / reflow per layoutMode. */
  insertCell: (cell: GridCellRecord) => void
  /** Remove a cell, compacting in auto mode. */
  deleteCell: (cellId: string) => void
  /** Resize a cell, keeping the grid overlap-free (displace/reflow per mode).
   *  `position` is set when a top/left handle also moved the cell's origin. */
  resizeCell: (cellId: string, size: GridSize, position?: GridCellPosition) => void
  /** Current placement strategy (defaults to 'freeform'). */
  layoutMode: LayoutMode
}

let idCounter = 0
function newId(): string {
  return `cell-${Date.now()}-${++idCounter}`
}

export function useGridLayout(
  initialConfig: GridLayoutConfig,
  adapter?: GridPersistenceAdapter,
  /** Module-level constraint resolver — auto layout consults it. Optional. */
  resolveConstraints?: ConstraintResolver,
): UseGridLayoutReturn {
  const [layout, setLayout] = useState<GridLayoutConfig>(initialConfig)
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const resolveRef = useRef(resolveConstraints)
  resolveRef.current = resolveConstraints

  const mode: LayoutMode = layout.layoutMode ?? 'freeform'

  // Persisting must wait for the stored layout to arrive: saving the initial
  // config first would clobber it (visible under StrictMode's double-mount).
  const loadedRef = useRef(false)

  // Load persisted layout once on mount
  useEffect(() => {
    if (!adapterRef.current) {
      loadedRef.current = true
      return
    }
    adapterRef.current.load(initialConfig.layoutId).then((saved) => {
      if (saved) setLayout(saved)
      loadedRef.current = true
    })
  }, [initialConfig.layoutId])

  // Persist on every change, only after the initial load settled. Adapters
  // that also push remote changes (cloud) dedupe an unchanged config, so
  // applying a remote update below does not echo back out as a save.
  useEffect(() => {
    if (!loadedRef.current) return
    adapterRef.current?.save(layout)
  }, [layout])

  // Live updates from other devices (cloud adapter only). setLayout with the
  // incoming config re-renders the grid; the adapter has already recorded it as
  // its snapshot, so the save effect above no-ops instead of looping.
  useEffect(() => {
    const adapter = adapterRef.current
    if (!adapter?.subscribe) return
    return adapter.subscribe(initialConfig.layoutId, (remote) => setLayout(remote))
  }, [initialConfig.layoutId])

  const moveCell = useCallback((cellId: string, pos: GridCellPosition) => {
    setLayout((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === cellId ? { ...c, position: pos } : c)),
    }))
  }, [])

  const updateConfig = useCallback(
    (patch: Partial<Pick<GridLayoutConfig, 'columns' | 'cellSize' | 'gap' | 'layoutMode'>>) => {
      setLayout((prev) => {
        const next = { ...prev, ...patch }
        // Switching into auto mode (or re-packing after a column change while auto)
        // relayouts the whole grid so it lands consistent immediately.
        const goingAuto = next.layoutMode === 'auto'
        if (goingAuto && (patch.layoutMode === 'auto' || patch.columns !== undefined)) {
          return {
            ...next,
            cells: autoPackCells(next.cells, next.columns, resolveRef.current),
          }
        }
        return next
      })
    },
    [],
  )

  const addCell = useCallback((cell: Omit<GridCellRecord, 'id'>): GridCellRecord => {
    const record: GridCellRecord = { ...cell, id: newId() }
    setLayout((prev) => ({ ...prev, cells: [...prev.cells, record] }))
    return record
  }, [])

  const removeCell = useCallback((cellId: string) => {
    setLayout((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== cellId) }))
  }, [])

  const applyCells = useCallback((updatedCells: GridCellRecord[]) => {
    setLayout((prev) => ({ ...prev, cells: updatedCells }))
  }, [])

  // ── Window-manager mutators ─────────────────────────────────────────────────

  const insertCell = useCallback((cell: GridCellRecord) => {
    setLayout((prev) => ({
      ...prev,
      cells: insertCellInto(prev.cells, prev.columns, cell, prev.layoutMode ?? 'freeform', resolveRef.current),
    }))
  }, [])

  const deleteCell = useCallback((cellId: string) => {
    setLayout((prev) => ({
      ...prev,
      cells: removeCellFrom(prev.cells, prev.columns, cellId, prev.layoutMode ?? 'freeform', resolveRef.current),
    }))
  }, [])

  const resizeCell = useCallback((cellId: string, size: GridSize, position?: GridCellPosition) => {
    setLayout((prev) => ({
      ...prev,
      cells: resizeCellIn(
        prev.cells,
        prev.columns,
        cellId,
        size,
        prev.layoutMode ?? 'freeform',
        resolveRef.current,
        position,
      ),
    }))
  }, [])

  return {
    layout,
    moveCell,
    applyCells,
    updateConfig,
    addCell,
    removeCell,
    insertCell,
    deleteCell,
    resizeCell,
    layoutMode: mode,
  }
}
