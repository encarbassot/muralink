import { useCallback, useEffect, useRef, useState } from 'react'
import type { GridCellRecord, GridCellPosition, GridLayoutConfig, GridPersistenceAdapter } from '@muralink/types'

export interface UseGridLayoutReturn {
  layout: GridLayoutConfig
  moveCell: (cellId: string, pos: GridCellPosition) => void
  /** Apply a full updated cell array from DisplacementPlanner in one state update. */
  applyCells: (updatedCells: GridCellRecord[]) => void
  updateConfig: (patch: Partial<Pick<GridLayoutConfig, 'columns' | 'cellSize' | 'gap'>>) => void
  addCell: (cell: Omit<GridCellRecord, 'id'>) => GridCellRecord
  removeCell: (cellId: string) => void
}

let idCounter = 0
function newId(): string {
  return `cell-${Date.now()}-${++idCounter}`
}

export function useGridLayout(
  initialConfig: GridLayoutConfig,
  adapter?: GridPersistenceAdapter,
): UseGridLayoutReturn {
  const [layout, setLayout] = useState<GridLayoutConfig>(initialConfig)
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter

  // Load persisted layout once on mount
  useEffect(() => {
    if (!adapterRef.current) return
    adapterRef.current.load(initialConfig.layoutId).then((saved) => {
      if (saved) setLayout(saved)
    })
  }, [initialConfig.layoutId])

  // Persist on every change
  useEffect(() => {
    adapterRef.current?.save(layout)
  }, [layout])

  const moveCell = useCallback((cellId: string, pos: GridCellPosition) => {
    setLayout((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === cellId ? { ...c, position: pos } : c)),
    }))
  }, [])

  const updateConfig = useCallback(
    (patch: Partial<Pick<GridLayoutConfig, 'columns' | 'cellSize' | 'gap'>>) => {
      setLayout((prev) => ({ ...prev, ...patch }))
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

  return { layout, moveCell, applyCells, updateConfig, addCell, removeCell }
}
