/**
 * algorithm.ts — Pure grid displacement algorithm. No React, no DOM.
 *
 * Classes:
 *   OccupancyMap       — 2D bitfield: which cellId owns each grid slot
 *   SlotFinder         — BFS slot search with directional bias
 *   DisplacementPlanner — Main algorithm: drag wins, everyone else moves
 */

import type { GridSize, GridCellRecord, GridCellPosition } from '@muralink/types'

// ── Half-cell lattice ─────────────────────────────────────────────────────────
// Positions and spans snap to 0.5-cell steps. The occupancy map works on an
// integer lattice at double resolution (RES half-units per cell), so a cell at
// col 1.5 spanning 2 cells occupies half-slots 3..6. STEP is the cell-space
// granularity used when searching for free slots.

export const RES = 2          // half-units per cell
export const STEP = 1 / RES   // 0.5 — the snap granularity in cell units

/** Convert a cell-space coordinate/length to integer half-units. */
function hu(v: number): number {
  return Math.round(v * RES)
}

/** Round a cell-space value to the nearest 0.5 step. */
export function snap05(v: number): number {
  return Math.round(v * RES) / RES
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a GridSize string into col/row span (may be fractional, e.g. 1.5). */
export function sizeSpan(size: GridSize): { cols: number; rows: number } {
  const [c, r] = size.split('x').map(Number) as [number, number]
  return { cols: c, rows: r }
}

function sizeArea(size: GridSize): number {
  const { cols, rows } = sizeSpan(size)
  return cols * rows
}

function snapPos(pos: GridCellPosition): { col: number; row: number } {
  return { col: snap05(pos.col), row: snap05(pos.row) }
}

// ── OccupancyMap ──────────────────────────────────────────────────────────────

/**
 * Tracks which cellId occupies each half-cell slot.
 * A single cell with span (C×R) marks (C·RES)×(R·RES) individual half-slots.
 *
 * Coordinates and spans are in cell units (may be fractional, on the 0.5 grid);
 * they are converted to integer half-units internally via hu().
 */
export class OccupancyMap {
  private slots = new Map<string, string>() // "hcol:hrow" → cellId (half-unit keys)

  private k(col: number, row: number): string {
    return `${col}:${row}`
  }

  mark(cellId: string, col: number, row: number, colSpan: number, rowSpan: number): void {
    const c0 = hu(col), r0 = hu(row), cS = hu(colSpan), rS = hu(rowSpan)
    for (let r = r0; r < r0 + rS; r++) {
      for (let c = c0; c < c0 + cS; c++) {
        this.slots.set(this.k(c, r), cellId)
      }
    }
  }

  unmark(col: number, row: number, colSpan: number, rowSpan: number): void {
    const c0 = hu(col), r0 = hu(row), cS = hu(colSpan), rS = hu(rowSpan)
    for (let r = r0; r < r0 + rS; r++) {
      for (let c = c0; c < c0 + cS; c++) {
        this.slots.delete(this.k(c, r))
      }
    }
  }

  /** True if every half-slot in the rectangle is free. */
  fits(col: number, row: number, colSpan: number, rowSpan: number, columns: number): boolean {
    const c0 = hu(col), r0 = hu(row), cS = hu(colSpan), rS = hu(rowSpan)
    if (c0 < 0 || c0 + cS > hu(columns) || r0 < 0) return false
    for (let r = r0; r < r0 + rS; r++) {
      for (let c = c0; c < c0 + cS; c++) {
        if (this.slots.has(this.k(c, r))) return false
      }
    }
    return true
  }

  /** Unique cellIds that overlap a given rectangle. */
  conflictsIn(col: number, row: number, colSpan: number, rowSpan: number): Set<string> {
    const c0 = hu(col), r0 = hu(row), cS = hu(colSpan), rS = hu(rowSpan)
    const result = new Set<string>()
    for (let r = r0; r < r0 + rS; r++) {
      for (let c = c0; c < c0 + cS; c++) {
        const id = this.slots.get(this.k(c, r))
        if (id !== undefined) result.add(id)
      }
    }
    return result
  }

  occupant(col: number, row: number): string | null {
    return this.slots.get(this.k(hu(col), hu(row))) ?? null
  }

  clone(): OccupancyMap {
    const copy = new OccupancyMap()
    for (const [k, v] of this.slots) copy.slots.set(k, v)
    return copy
  }
}

// ── SlotFinder ────────────────────────────────────────────────────────────────

export type SearchBias =
  | 'down'     // try rows below preferRow first (gravity model)
  | 'up'       // try rows above preferRow first
  | 'nearest'  // nearest row in either direction

/**
 * BFS-style slot search.
 * Scans the grid for the nearest (col, row) where a (colSpan × rowSpan) cell fits,
 * expanding outward from a preferred origin with a directional row bias.
 */
export class SlotFinder {
  find(
    preferCol: number,
    preferRow: number,
    colSpan: number,
    rowSpan: number,
    map: OccupancyMap,
    columns: number,
    bias: SearchBias = 'down',
    maxRows = 500,
  ): GridCellPosition | null {
    const rows = this.rowOrder(preferRow, maxRows, bias)
    const cols = this.colOrder(preferCol, colSpan, columns)

    for (const row of rows) {
      for (const col of cols) {
        if (map.fits(col, row, colSpan, rowSpan, columns)) {
          return { col, row }
        }
      }
    }
    return null
  }

  private rowOrder(preferRow: number, maxRows: number, bias: SearchBias): number[] {
    const p = snap05(preferRow)
    if (bias === 'down') {
      const rows: number[] = []
      for (let r = p; r < maxRows; r += STEP) rows.push(r)
      for (let r = p - STEP; r >= 0; r -= STEP) rows.push(r)
      return rows
    }
    if (bias === 'up') {
      const rows: number[] = []
      for (let r = p; r >= 0; r -= STEP) rows.push(r)
      for (let r = p + STEP; r < maxRows; r += STEP) rows.push(r)
      return rows
    }
    // nearest: p, +0.5, -0.5, +1, -1, ...
    const rows: number[] = [p]
    for (let d = STEP; d < maxRows; d += STEP) {
      if (p + d < maxRows) rows.push(p + d)
      if (p - d >= 0) rows.push(p - d)
    }
    return rows
  }

  private colOrder(preferCol: number, colSpan: number, columns: number): number[] {
    const maxCol = columns - colSpan
    const p = snap05(preferCol)
    const seen = new Set<number>()
    const order: number[] = []

    const push = (c: number) => {
      if (c >= 0 && c <= maxCol + 1e-9 && !seen.has(c)) {
        seen.add(c)
        order.push(c)
      }
    }

    push(Math.min(Math.max(p, 0), maxCol))
    for (let d = STEP; d <= columns; d += STEP) {
      push(p + d)
      push(p - d)
    }
    return order
  }
}

// ── DisplacementPlanner ───────────────────────────────────────────────────────

export interface DragPlan {
  /**
   * New positions for all non-dragging cells.
   * Only cells that needed to move are in this map; unchanged cells are absent.
   */
  displaced: Map<string, GridCellPosition>
  /** Whether any cell was displaced. */
  anyDisplaced: boolean
}

/**
 * Core displacement algorithm.
 *
 * Rule: the dragging cell always wins its snap target.
 * Every cell that would overlap it gets pushed out — cascading
 * until the grid is fully consistent.
 *
 * Displacement direction: primary = below the drag area (gravity).
 * Cascades are resolved via a BFS queue: displaced cells that land
 * on yet another cell add that cell to the queue.
 *
 * Larger cells (by area) are processed first so they have first pick
 * of available space.
 */
export class DisplacementPlanner {
  private finder = new SlotFinder()

  plan(
    cells: GridCellRecord[],
    draggingId: string,
    snapTarget: GridCellPosition,
  ): DragPlan {
    // Derive columns from the rightmost cell extent
    const columns = this.inferColumns(cells)
    return this.planWithColumns(cells, draggingId, snapTarget, columns)
  }

  planWithColumns(
    cells: GridCellRecord[],
    draggingId: string,
    snapTarget: GridCellPosition,
    columns: number,
  ): DragPlan {
    const draggingCell = cells.find((c) => c.id === draggingId)
    if (!draggingCell) return { displaced: new Map(), anyDisplaced: false }

    const { cols: dragCols, rows: dragRows } = sizeSpan(draggingCell.size)
    const { col: snapCol, row: snapRow } = snapPos(snapTarget)

    const clampedCol = Math.min(Math.max(snapCol, 0), columns - dragCols)
    const clampedRow = Math.max(snapRow, 0)

    // Original (pre-drag) positions — used as the "home" for each cell.
    // We minimise total displacement by having each cell seek its home position.
    const originalPos = new Map<string, { col: number; row: number }>()
    const workingPos = new Map<string, { col: number; row: number }>()
    for (const c of cells) {
      if (c.id === draggingId) continue
      const snapped = snapPos(c.position)
      originalPos.set(c.id, snapped)
      workingPos.set(c.id, { ...snapped })
    }

    const map = new OccupancyMap()
    for (const c of cells) {
      if (c.id === draggingId) continue
      const pos = workingPos.get(c.id)!
      const { cols, rows } = sizeSpan(c.size)
      map.mark(c.id, pos.col, pos.row, cols, rows)
    }

    const initialConflicts = map.conflictsIn(clampedCol, clampedRow, dragCols, dragRows)
    if (initialConflicts.size === 0) {
      return { displaced: new Map(), anyDisplaced: false }
    }

    map.mark(draggingId, clampedCol, clampedRow, dragCols, dragRows)

    // Process conflicts — larger cells get first pick of available slots.
    // Each cell is assigned the slot NEAREST to its original position, not just
    // pushed downward, so the total displacement distance is minimised.
    const queue: GridCellRecord[] = [...initialConflicts]
      .map((id) => cells.find((c) => c.id === id)!)
      .filter(Boolean)
      .sort((a, b) => sizeArea(b.size) - sizeArea(a.size))

    const inQueue = new Set(queue.map((c) => c.id))
    const displaced = new Map<string, GridCellPosition>()

    while (queue.length > 0) {
      const cell = queue.shift()!
      const { cols, rows } = sizeSpan(cell.size)
      const currentPos = workingPos.get(cell.id)!
      const homePos = originalPos.get(cell.id) ?? currentPos

      map.unmark(currentPos.col, currentPos.row, cols, rows)

      // Seek nearest slot to the cell's ORIGINAL position (minimises travel distance).
      // Falls back to downward expansion if nothing nearby is free.
      const slot =
        this.finder.find(homePos.col, homePos.row, cols, rows, map, columns, 'nearest') ??
        this.finder.find(homePos.col, homePos.row, cols, rows, map, columns, 'down')

      if (slot) {
        const newConflicts = map.conflictsIn(slot.col, slot.row, cols, rows)
        for (const conflictId of newConflicts) {
          if (!inQueue.has(conflictId) && conflictId !== draggingId) {
            const conflictCell = cells.find((c) => c.id === conflictId)
            if (conflictCell) {
              queue.push(conflictCell)
              inQueue.add(conflictId)
            }
          }
        }

        workingPos.set(cell.id, slot)
        map.mark(cell.id, slot.col, slot.row, cols, rows)
        displaced.set(cell.id, { col: slot.col, row: slot.row })
      } else {
        map.mark(cell.id, currentPos.col, currentPos.row, cols, rows)
      }
    }

    return { displaced, anyDisplaced: displaced.size > 0 }
  }

  private inferColumns(cells: GridCellRecord[]): number {
    let max = 6 // default
    for (const c of cells) {
      const { cols } = sizeSpan(c.size)
      const right = Math.round(c.position.col) + cols
      if (right > max) max = right
    }
    return max
  }
}
