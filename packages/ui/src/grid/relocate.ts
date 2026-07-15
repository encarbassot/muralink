/**
 * relocate.ts — Drag-to-reorder UX behaviour.
 *
 * Wraps useGridDrag with live displacement: the dragging element has
 * absolute priority on its target slot; all other cells animate out
 * of the way in real time as you drag.
 *
 * Usage:
 *   const { cellRenderProps, startDrag, snapTarget, isDragging } =
 *     useGridRelocate(layout, (updatedCells) => applyPositions(updatedCells))
 *
 *   // In your cell renderer:
 *   const { livePos, isDragging: thisCellDragging, isDisplaced } = cellRenderProps(cell)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { GridCellRecord, GridCellPosition, GridLayoutConfig } from '@muralink/types'
import { useGridDrag } from '../hooks/useGridDrag.js'
import { DisplacementPlanner, sizeSpan, snap05 } from './algorithm.js'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Per-cell rendering props returned by cellRenderProps(). */
export interface CellRenderProps {
  /** Current visual position (fractional while dragging, integer when static/displaced). */
  livePos: GridCellPosition
  /** True only on the cell being dragged. */
  isDragging: boolean
  /** True on cells that have been pushed to a preview position by the drag. */
  isDisplaced: boolean
}

export interface UseGridRelocateReturn {
  /**
   * Get per-cell rendering props. Call once per cell inside your render loop.
   * Stable reference — won't cause unnecessary re-renders of sibling cells.
   */
  cellRenderProps: (cell: GridCellRecord) => CellRenderProps

  /**
   * Attach to each cell's onPointerDown.
   * Replaces useGridDrag's startDrag — handles colSpan lookup internally.
   */
  startDrag: (cellId: string, pos: GridCellPosition, e: React.PointerEvent) => void

  /** Current snap target (integer col/row), null when not snapping. For ghost rendering. */
  snapTarget: GridCellPosition | null

  /** Whether any drag is in progress. */
  isDragging: boolean
}

// ── Singleton planner — stateless, safe to share ──────────────────────────────

const planner = new DisplacementPlanner()

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useGridRelocate
 *
 * Drag UX with live displacement:
 *   - Dragging cell follows the pointer (smooth, fractional position)
 *   - As snap target changes, other cells animate to their displaced positions
 *   - On drop, onCommit receives the fully resolved cell array (all positions updated)
 *
 * @param layout     Current grid layout (read on every drag event via ref — no stale closures)
 * @param onCommit   Called once on drop with the updated GridCellRecord array
 */
export function useGridRelocate(
  layout: GridLayoutConfig,
  onCommit: (updatedCells: GridCellRecord[]) => void,
): UseGridRelocateReturn {
  // Displaced positions during drag: cellId → preview position
  // null = no drag active
  const [displaced, setDisplaced] = useState<Map<string, GridCellPosition> | null>(null)

  // Layout ref so drag callbacks always see the latest layout without re-subscribing
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  // ── Drop handler ────────────────────────────────────────────────────────────

  const handleDrop = useCallback((cellId: string, rawPos: GridCellPosition) => {
    const { cells, columns } = layoutRef.current
    const finalPos: GridCellPosition = {
      col: snap05(rawPos.col),
      row: snap05(rawPos.row),
    }

    const { displaced: plan } = planner.planWithColumns(cells, cellId, finalPos, columns)

    const updatedCells = cells.map((c) => {
      if (c.id === cellId) return { ...c, position: finalPos }
      const next = plan.get(c.id)
      return next ? { ...c, position: next } : c
    })

    setDisplaced(null)
    onCommitRef.current(updatedCells)
  }, [])

  // ── Drag tracking ───────────────────────────────────────────────────────────

  const { dragState, startDrag: rawStartDrag } = useGridDrag(
    layout.cellSize,
    layout.gap,
    1 / 3,
    handleDrop,
  )

  // ── Recompute displacement on snap target change ─────────────────────────────

  // Serialise snap target to a stable string key to avoid object reference churn
  const snapKey = useMemo(() => {
    if (!dragState?.snapTarget) return null
    const { col, row } = dragState.snapTarget
    return `${dragState.cellId}:${col}:${row}`
  }, [dragState])

  useEffect(() => {
    if (!snapKey || !dragState?.snapTarget) {
      setDisplaced(null)
      return
    }

    const { cells, columns } = layoutRef.current
    const { displaced: plan, anyDisplaced } = planner.planWithColumns(
      cells,
      dragState.cellId,
      dragState.snapTarget,
      columns,
    )

    setDisplaced(anyDisplaced ? new Map(plan) : null)
  }, [snapKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ layoutRef is intentionally excluded — we want this to run only on snap changes,
  //   not on every layout mutation. The ref always reads the latest value.

  // Clear displaced positions when drag ends
  useEffect(() => {
    if (!dragState) setDisplaced(null)
  }, [dragState])

  // ── startDrag wrapper ───────────────────────────────────────────────────────

  const startDrag = useCallback(
    (cellId: string, pos: GridCellPosition, e: React.PointerEvent) => {
      const { cells, columns } = layoutRef.current
      const cell = cells.find((c) => c.id === cellId)
      const { cols } = sizeSpan(cell?.size ?? '1x1')
      rawStartDrag(cellId, pos, e, cols, columns)
    },
    [rawStartDrag],
  )

  // ── Per-cell rendering props ─────────────────────────────────────────────────

  const cellRenderProps = useCallback(
    (cell: GridCellRecord): CellRenderProps => {
      const isDraggingThis = dragState?.cellId === cell.id

      const livePos: GridCellPosition = isDraggingThis
        ? dragState!.currentPos
        : (displaced?.get(cell.id) ?? cell.position)

      return {
        livePos,
        isDragging: isDraggingThis,
        isDisplaced: !isDraggingThis && displaced?.has(cell.id) === true,
      }
    },
    [dragState, displaced],
  )

  return {
    cellRenderProps,
    startDrag,
    snapTarget: dragState?.snapTarget ?? null,
    isDragging: dragState !== null,
  }
}
