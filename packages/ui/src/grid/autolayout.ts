/**
 * autolayout.ts — Pure automatic window-manager layer over the displacement core.
 *
 * The grid becomes a window manager: it ORDERS, PACKS and REFLOWS cells on every
 * mutation, honoring each widget's LayoutConstraints. No React, no DOM.
 *
 * Two placement strategies (per GridLayoutConfig.layoutMode):
 *   - 'freeform' — user owns positions; we only keep the grid overlap-free by
 *     reusing DisplacementPlanner (a new/resized cell wins, neighbors get pushed).
 *   - 'auto'     — the grid owns positions; every change re-runs autoPack, a
 *     deterministic priority-ordered flow packer with elastic (grow) sizing.
 *
 * Everything here is built on the existing primitives in algorithm.ts
 * (OccupancyMap · SlotFinder · DisplacementPlanner) — no new geometry.
 */

import type {
  GridCellRecord,
  GridCellPosition,
  GridSize,
  LayoutConstraints,
  LayoutMode,
} from '@muralink/types'
import { DisplacementPlanner, SlotFinder, OccupancyMap, sizeSpan, snap05 } from './algorithm.js'

// ── Constraint resolution ──────────────────────────────────────────────────────

/** Resolves a cell's module-level constraints. The engine merges the cell's own
 *  `constraints` override on top, so a resolver only needs the module default. */
export type ConstraintResolver = (cell: GridCellRecord) => LayoutConstraints | undefined

const HARD_MIN = 0.5 // absolute floor for any span (matches GridCell MIN_SPAN)
const HARD_MAX = 3 // absolute ceiling for any span (matches GridCell MAX_SPAN)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Effective constraints for a cell = module default with per-cell override on top. */
export function effectiveConstraints(
  cell: GridCellRecord,
  resolve?: ConstraintResolver,
): LayoutConstraints {
  return { ...(resolve?.(cell) ?? {}), ...(cell.constraints ?? {}) }
}

interface Span {
  cols: number
  rows: number
}

function spanOf(size: GridSize): Span {
  return sizeSpan(size)
}

function fmt(span: Span): GridSize {
  return `${snap05(span.cols)}x${snap05(span.rows)}`
}

/**
 * The size a cell should occupy given its constraints and the column budget.
 * `elastic` (auto mode) lets a `grow` widget target its max footprint; otherwise
 * we keep the cell's current size, clamped to [min, max] and the grid width.
 */
export function constrainedSize(
  cell: GridCellRecord,
  columns: number,
  c: LayoutConstraints,
  elastic: boolean,
): Span {
  const min = c.min ? spanOf(c.min) : { cols: HARD_MIN, rows: HARD_MIN }
  const max = c.max ? spanOf(c.max) : { cols: HARD_MAX, rows: HARD_MAX }

  // Base target: grow widgets reach for preferred/max; everyone else keeps current.
  let base: Span
  if (elastic && c.grow) base = c.preferred ? spanOf(c.preferred) : { ...max }
  else base = spanOf(cell.size)

  const colCap = Math.min(max.cols, columns)
  let cols = clamp(base.cols, min.cols, colCap)
  let rows = clamp(base.rows, min.rows, max.rows)

  // Nudge toward the declared aspect (cols/rows) without violating the clamps —
  // this is what keeps a "tall" calendar tall instead of stretched square.
  if (c.aspect && c.aspect > 0) {
    const target = snap05(clamp(rows * c.aspect, min.cols, colCap))
    if (target >= min.cols) cols = target
  }
  return { cols, rows }
}

/**
 * Default footprint for a freshly added widget, honoring orientation/aspect.
 * `fallback` is the descriptor's declared default size.
 */
export function defaultSizeFor(
  fallback: GridSize,
  c: LayoutConstraints | undefined,
  columns: number,
): GridSize {
  if (!c) return fallback
  if (c.preferred) return c.preferred
  let { cols, rows } = spanOf(fallback)
  const min = c.min ? spanOf(c.min) : { cols: HARD_MIN, rows: HARD_MIN }
  const max = c.max ? spanOf(c.max) : { cols: Math.min(HARD_MAX, columns), rows: HARD_MAX }
  // Orientation steers the default shape when the fallback contradicts it.
  if (c.orientation === 'tall' && cols >= rows) rows = clamp(cols + 0.5, rows, max.rows)
  if (c.orientation === 'wide' && rows >= cols) cols = clamp(rows + 0.5, cols, max.cols)
  if (c.orientation === 'square') rows = cols = clamp(Math.max(cols, rows), Math.max(min.cols, min.rows), Math.min(max.cols, max.rows))
  return fmt({ cols: clamp(cols, min.cols, max.cols), rows: clamp(rows, min.rows, max.rows) })
}

// ── Ordering ────────────────────────────────────────────────────────────────────

/**
 * Packing order: higher priority first, then reading order (row, then col) of the
 * cell's CURRENT position. Reading order keeps auto layout stable and predictable —
 * a relayout doesn't shuffle unrelated cells around.
 */
function packOrder(cells: GridCellRecord[], resolve?: ConstraintResolver): GridCellRecord[] {
  return [...cells].sort((a, b) => {
    const pa = effectiveConstraints(a, resolve).priority ?? 0
    const pb = effectiveConstraints(b, resolve).priority ?? 0
    if (pa !== pb) return pb - pa
    if (a.position.row !== b.position.row) return a.position.row - b.position.row
    return a.position.col - b.position.col
  })
}

// ── autoPack — the window-manager relayout ──────────────────────────────────────

/**
 * Deterministic flow packer. Places every cell top-to-bottom, left-to-right in
 * priority/reading order, sizing each within its constraints. Cells are packed
 * with downward gravity via SlotFinder, so holes fill and the layout stays tight.
 *
 * Returns a new array in the SAME order as `cells` (stable React keys), with
 * updated position + size.
 */
export function autoPack(
  cells: GridCellRecord[],
  columns: number,
  resolve?: ConstraintResolver,
): GridCellRecord[] {
  const map = new OccupancyMap()
  const finder = new SlotFinder()
  const placed = new Map<string, { position: { col: number; row: number }; size: GridSize }>()

  let nextRow = 0
  for (const cell of packOrder(cells, resolve)) {
    const c = effectiveConstraints(cell, resolve)
    const { cols, rows } = constrainedSize(cell, columns, c, true)

    const slot =
      finder.find(0, 0, cols, rows, map, columns, 'down') ?? { col: 0, row: nextRow }

    map.mark(cell.id, slot.col, slot.row, cols, rows)
    nextRow = Math.max(nextRow, slot.row + rows)
    placed.set(cell.id, { position: slot, size: fmt({ cols, rows }) })
  }

  return cells.map((orig) => {
    const p = placed.get(orig.id)
    return p ? { ...orig, position: p.position, size: p.size } : orig
  })
}

// ── Freeform overlap resolution (reuses DisplacementPlanner) ─────────────────────

const planner = new DisplacementPlanner()

/**
 * Treat `winnerId` as the cell that just claimed its rectangle (a new add or a
 * grow-resize) and push every overlapping neighbor out of the way. Pure; returns
 * a new cell array. This is the freeform-mode counterpart to autoPack.
 */
function resolveOverlaps(
  cells: GridCellRecord[],
  columns: number,
  winnerId: string,
): GridCellRecord[] {
  const winner = cells.find((c) => c.id === winnerId)
  if (!winner) return cells
  const { displaced } = planner.planWithColumns(cells, winnerId, winner.position, columns)
  if (displaced.size === 0) return cells
  return cells.map((c) => {
    if (c.id === winnerId) return c
    const next = displaced.get(c.id)
    return next ? { ...c, position: next } : c
  })
}

// ── Semantic mutations — the API the app layer calls ─────────────────────────────

/**
 * Insert a fully-formed cell. In 'auto' the whole grid reflows around it; in
 * 'freeform' the cell keeps its requested position and overlapped neighbors slide
 * away — no more silent stacking on top of an existing widget.
 */
export function insertCell(
  cells: GridCellRecord[],
  columns: number,
  newCell: GridCellRecord,
  mode: LayoutMode,
  resolve?: ConstraintResolver,
): GridCellRecord[] {
  const all = [...cells, newCell]
  if (mode === 'auto') return autoPack(all, columns, resolve)
  return resolveOverlaps(all, columns, newCell.id)
}

/**
 * Remove a cell. In 'auto' the layout compacts to fill the hole; in 'freeform'
 * the hole is left as-is (the user placed things deliberately).
 */
export function removeCell(
  cells: GridCellRecord[],
  columns: number,
  cellId: string,
  mode: LayoutMode,
  resolve?: ConstraintResolver,
): GridCellRecord[] {
  const rest = cells.filter((c) => c.id !== cellId)
  return mode === 'auto' ? autoPack(rest, columns, resolve) : rest
}

/**
 * Resize a cell. Both modes keep the grid overlap-free: 'auto' reflows everything,
 * 'freeform' displaces only the neighbors the grow ran into (fixes today's bug
 * where growing a cell silently overlapped its neighbors).
 */
export function resizeCell(
  cells: GridCellRecord[],
  columns: number,
  cellId: string,
  size: GridSize,
  mode: LayoutMode,
  resolve?: ConstraintResolver,
  /** Set when the resize also moved the cell's origin (dragging a top/left
   *  handle). Omitted for a plain bottom/right-only resize. */
  position?: GridCellPosition,
): GridCellRecord[] {
  const resized = cells.map((c) => (c.id === cellId ? { ...c, size, position: position ?? c.position } : c))
  if (mode === 'auto') return autoPack(resized, columns, resolve)
  return resolveOverlaps(resized, columns, cellId)
}
