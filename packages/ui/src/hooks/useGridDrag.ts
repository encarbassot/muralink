import { useCallback, useEffect, useRef, useState } from 'react'
import type { GridCellPosition } from '@muralink/types'

export interface DragState {
  cellId: string
  startPointer: { x: number; y: number }
  startPos: GridCellPosition
  currentPos: GridCellPosition
  snapTarget: GridCellPosition | null
}

export interface UseGridDragReturn {
  dragState: DragState | null
  startDrag: (
    cellId: string,
    startPos: GridCellPosition,
    e: React.PointerEvent,
    colSpan: number,
    columns: number,
  ) => void
}

/** Snap a value to the nearest 0.5-cell step. */
function snap05(v: number): number {
  return Math.round(v * 2) / 2
}

/** Pure function — extract for unit testing. Snaps to the 0.5-cell grid. */
export function computeSnapPosition(
  rawCol: number,
  rawRow: number,
  threshold = 1 / 3,
): { col: number; row: number; isSnapped: boolean } {
  const snapCol = snap05(rawCol)
  const snapRow = snap05(rawRow)
  const isSnapped =
    Math.abs(rawCol - snapCol) <= threshold && Math.abs(rawRow - snapRow) <= threshold
  return isSnapped
    ? { col: snapCol, row: snapRow, isSnapped: true }
    : { col: rawCol, row: rawRow, isSnapped: false }
}

export function useGridDrag(
  cellSize: number,
  gap: number,
  snapThreshold = 1 / 3,
  onDrop?: (cellId: string, finalPos: GridCellPosition) => void,
): UseGridDragReturn {
  const [dragState, setDragState] = useState<DragState | null>(null)

  // Keep mutable refs to avoid stale closures in window listeners
  const dragRef = useRef<DragState | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const configRef = useRef({ cellSize, gap, snapThreshold })
  configRef.current = { cellSize, gap, snapThreshold }

  // Columns + span captured per-drag
  const boundsRef = useRef<{ colSpan: number; columns: number }>({ colSpan: 1, columns: 6 })

  const startDrag = useCallback(
    (
      cellId: string,
      startPos: GridCellPosition,
      e: React.PointerEvent,
      colSpan: number,
      columns: number,
    ) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      boundsRef.current = { colSpan, columns }
      const state: DragState = {
        cellId,
        startPointer: { x: e.clientX, y: e.clientY },
        startPos,
        currentPos: startPos,
        snapTarget: null,
      }
      dragRef.current = state
      setDragState(state)
    },
    [],
  )

  useEffect(() => {
    if (!dragState) return

    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const { cellSize, gap, snapThreshold } = configRef.current
      const { colSpan, columns } = boundsRef.current
      const unitW = cellSize + gap

      const deltaX = e.clientX - d.startPointer.x
      const deltaY = e.clientY - d.startPointer.y

      const rawCol = d.startPos.col + deltaX / unitW
      const rawRow = d.startPos.row + deltaY / unitW

      const { col: snapCol, row: snapRow, isSnapped } = computeSnapPosition(
        rawCol,
        rawRow,
        snapThreshold,
      )

      // Clamp: col can't push cell off the right edge; row grows freely
      const clampedCol = Math.max(0, Math.min(isSnapped ? snapCol : rawCol, columns - colSpan))
      const clampedRow = Math.max(0, isSnapped ? snapRow : rawRow)

      const next: DragState = {
        ...d,
        currentPos: { col: clampedCol, row: clampedRow },
        snapTarget: isSnapped ? { col: snap05(clampedCol), row: snap05(clampedRow) } : null,
      }
      dragRef.current = next
      setDragState(next)
    }

    function onUp() {
      const d = dragRef.current
      if (!d) return
      const finalPos = d.snapTarget ?? d.currentPos
      onDropRef.current?.(d.cellId, finalPos)
      dragRef.current = null
      setDragState(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragState])

  return { dragState, startDrag }
}
