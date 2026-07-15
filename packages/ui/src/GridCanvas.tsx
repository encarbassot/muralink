import { useState, useMemo, useRef } from 'react'
import type React from 'react'
import type { GridCellRecord, GridCellPosition, GridLayoutConfig, GridSize } from '@muralink/types'
import { bentoSizeToCols } from './BentoGrid.js'
import { GridCell } from './GridCell.js'
import type { CellMenuItem } from './CellMenu.js'
import { useGridRelocate } from './grid/relocate.js'
import { OccupancyMap, STEP, snap05 } from './grid/algorithm.js'

export interface GridCanvasProps {
  layout: GridLayoutConfig
  onCellsUpdate: (updatedCells: GridCellRecord[]) => void
  renderCell: (cell: GridCellRecord, isDragging: boolean) => React.ReactNode
  editMode?: boolean
  onEnterEditMode?: () => void
  onCellEditClick?: (cellId: string) => void
  /**
   * Called to add a new element. A plain click on an empty slot passes just
   * (col, row) — a 1×1 default. A marquee drag across empty space passes the
   * full (col, row, cols, rows) on the 0.5-cell lattice, so the user defines
   * both position and size in one gesture.
   */
  onAddElement?: (col: number, row: number, cols?: number, rows?: number) => void
  /** Called when a cell is resized via the corner handle. */
  onCellResize?: (cellId: string, newSize: GridSize) => void
  /** Header ⋯ menu items for a cell (grid options + module methods). Absent = no ⋯. */
  getCellMenu?: (cell: GridCellRecord) => CellMenuItem[]
  /** Resolves a cell's configured click action for VIEW mode. undefined = not clickable. */
  resolveCellClick?: (cell: GridCellRecord) => (() => void) | undefined
  showGridLines?: boolean
  minHeight?: number
  className?: string
  style?: React.CSSProperties
}

function computeCanvasHeight(
  cells: GridCellRecord[],
  cellSize: number,
  gap: number,
  minHeight: number,
): number {
  let max = 0
  for (const c of cells) {
    const { rows } = bentoSizeToCols(c.size)
    const bottom = Math.ceil(c.position.row) + rows
    const px = bottom * (cellSize + gap) + gap
    if (px > max) max = px
  }
  return Math.max(max, minHeight)
}

export function GridCanvas({
  layout,
  onCellsUpdate,
  renderCell,
  editMode = false,
  onEnterEditMode,
  onCellEditClick,
  onAddElement,
  onCellResize,
  getCellMenu,
  resolveCellClick,
  showGridLines = false,
  minHeight = 600,
  className,
  style,
}: GridCanvasProps) {
  const { cellSize, gap, columns, cells } = layout
  const unitW = cellSize + gap

  const { cellRenderProps, startDrag, snapTarget, isDragging } = useGridRelocate(
    layout,
    onCellsUpdate,
  )

  const canvasHeight = computeCanvasHeight(cells, cellSize, gap, minHeight)

  // ── Empty slot computation ───────────────────────────────────────────────────
  // Empty slots are shown in both modes; clicking one opens the add-element picker.

  const [bgHovered, setBgHovered] = useState(false)
  const [hoveredSlot, setHoveredSlot] = useState<{ col: number; row: number } | null>(null)
  // Live marquee rectangle (cell units, 0.5 lattice) while dragging on empty space.
  const [marquee, setMarquee] = useState<{ col: number; row: number; cols: number; rows: number } | null>(null)
  const dragRef = useRef<{ startCol: number; startRow: number; moved: boolean; left: number; top: number } | null>(null)

  const { emptySlots, emptySlotSet } = useMemo(() => {
    const map = new OccupancyMap()
    for (const c of cells) {
      const { cols, rows } = bentoSizeToCols(c.size)
      map.mark(c.id, c.position.col, c.position.row, cols, rows)
    }

    // Only show empty slots up to maxOccupiedRow + 1 (one expansion row)
    let maxRow = 0
    for (const c of cells) {
      const { rows } = bentoSizeToCols(c.size)
      maxRow = Math.max(maxRow, c.position.row + rows)
    }
    const rowLimit = maxRow + 1

    const slots: { col: number; row: number }[] = []
    const set = new Set<string>()
    for (let row = 0; row < rowLimit; row++) {
      for (let col = 0; col < columns; col++) {
        if (map.fits(col, row, 1, 1, columns)) {
          slots.push({ col, row })
          set.add(`${col}:${row}`)
        }
      }
    }
    return { emptySlots: slots, emptySlotSet: set }
  }, [cells, columns])

  // Snap a raw cell-unit value down to the 0.5 lattice, clamped to >= 0.
  function snapFloor(v: number) {
    return Math.max(0, Math.floor(v / STEP) * STEP)
  }

  function onBgPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      startCol: snapFloor((e.clientX - rect.left) / unitW),
      startRow: snapFloor((e.clientY - rect.top) / unitW),
      moved: false,
      left: rect.left,
      top: rect.top,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onBgPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) {
      const rect = e.currentTarget.getBoundingClientRect()
      const col = Math.floor((e.clientX - rect.left) / unitW)
      const row = Math.floor((e.clientY - rect.top) / unitW)
      setHoveredSlot(emptySlotSet.has(`${col}:${row}`) ? { col, row } : null)
      return
    }
    const cx = snap05((e.clientX - d.left) / unitW)
    const cy = snap05((e.clientY - d.top) / unitW)
    const col = Math.max(0, Math.min(d.startCol, cx))
    const row = Math.max(0, Math.min(d.startRow, cy))
    let cols = Math.max(STEP, Math.abs(cx - d.startCol))
    let rows = Math.max(STEP, Math.abs(cy - d.startRow))
    cols = Math.min(cols, columns - col)
    if (Math.abs(cx - d.startCol) >= STEP || Math.abs(cy - d.startRow) >= STEP) d.moved = true
    setMarquee({ col, row, cols, rows })
  }

  function onBgPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    dragRef.current = null
    const m = marquee
    setMarquee(null)
    if (!d) return
    // A real drag defines position + size; a plain click falls back to 1×1.
    if (d.moved && m && m.cols >= STEP && m.rows >= STEP) {
      onAddElement?.(m.col, m.row, m.cols, m.rows)
      return
    }
    const col = Math.floor((e.clientX - d.left) / unitW)
    const row = Math.floor((e.clientY - d.top) / unitW)
    if (emptySlotSet.has(`${col}:${row}`)) { onAddElement?.(col, row); return }
    if (!editMode) onEnterEditMode?.()
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: columns * (cellSize + gap) - gap,
        height: canvasHeight,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Background drag/click/hover layer — sits beneath all cells. Drag across
          empty space to marquee-select a new element's position and size; a plain
          click on an empty slot adds a 1×1 there. */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 0, touchAction: 'none' }}
        onMouseEnter={() => setBgHovered(true)}
        onMouseLeave={() => { if (!dragRef.current) { setBgHovered(false); setHoveredSlot(null) } }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerUp}
      />

      {/* Empty slot ghost tiles — visible in both modes (dimmer in normal mode) */}
      {emptySlots.map(({ col, row }) => {
        const isSlotHovered = hoveredSlot?.col === col && hoveredSlot?.row === row
        const isClickable = editMode && isSlotHovered
        return (
          <div
            key={`${col}:${row}`}
            style={{
              position: 'absolute',
              left: col * unitW,
              top: row * unitW,
              width: cellSize,
              height: cellSize,
              borderRadius: 'var(--capsule-radius, 14px)',
              border: `2px dashed ${isSlotHovered ? 'var(--accent, #4c9fff)' : 'var(--border, #d4cfc9)'}`,
              boxSizing: 'border-box',
              opacity: isSlotHovered ? 0.8 : bgHovered ? (editMode ? 0.55 : 0.4) : (editMode ? 0.3 : 0.18),
              transition: 'opacity 0.2s, border-color 0.15s',
              pointerEvents: 'none',
              zIndex: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isClickable ? 'pointer' : 'default',
            }}
          >
            {isSlotHovered && (
              <span style={{ color: 'var(--accent, #4c9fff)', fontSize: editMode ? 22 : 18, opacity: 0.8, lineHeight: 1, fontWeight: 300 }}>
                {editMode ? '+' : '+'}
              </span>
            )}
          </div>
        )
      })}

      {/* Marquee selection rectangle while dragging on empty space */}
      {marquee && (
        <div
          style={{
            position: 'absolute',
            left: marquee.col * unitW,
            top: marquee.row * unitW,
            width: Math.max(0, marquee.cols * unitW - gap),
            height: Math.max(0, marquee.rows * unitW - gap),
            borderRadius: 'var(--capsule-radius, 14px)',
            border: '2px solid var(--accent, #4c9fff)',
            background: 'var(--accent-dim, rgba(76,159,255,0.12))',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      )}

      {/* Grid line overlay (drag active or forced) */}
      {(isDragging || showGridLines) && editMode && (
        <GridLines columns={columns} cellSize={cellSize} gap={gap} height={canvasHeight} />
      )}

      {/* Cells */}
      {cells.map((cell) => {
        const { livePos, isDragging: thisDragging, isDisplaced } = cellRenderProps(cell)

        return (
          <GridCell
            key={cell.id}
            cell={cell}
            cellSize={cellSize}
            gap={gap}
            columns={columns}
            livePos={livePos}
            isDragging={thisDragging}
            isDisplaced={isDisplaced}
            editMode={editMode}
            onDragStart={editMode ? (id, pos, e) => startDrag(id, pos, e) : undefined}
            onClick={!editMode && resolveCellClick ? resolveCellClick(cell) : undefined}
            onEditClick={onCellEditClick ? () => onCellEditClick(cell.id) : undefined}
            onResize={onCellResize}
            getCellMenu={editMode ? getCellMenu : undefined}
          >
            {renderCell(cell, thisDragging)}
          </GridCell>
        )
      })}

      {/* Drop ghost during drag (edit mode) */}
      {snapTarget && isDragging && editMode && (
        <SnapGhost
          pos={snapTarget}
          cellId={cells.find((c) => cellRenderProps(c).isDragging)?.id ?? ''}
          cells={cells}
          cellSize={cellSize}
          gap={gap}
        />
      )}

      {/* Edit mode banner — subtle indicator at top */}
      {editMode && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 0,
            right: 0,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            pointerEvents: 'none',
            zIndex: 200,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Edit mode · Esc to exit
          </span>
        </div>
      )}
    </div>
  )
}

// ── Internal components ───────────────────────────────────────────────────────

function GridLines({
  columns,
  cellSize,
  gap,
  height,
}: {
  columns: number
  cellSize: number
  gap: number
  height: number
}) {
  const unitW = cellSize + gap
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        height,
      }}
    >
      {Array.from({ length: columns }, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: i * unitW,
            top: 0,
            width: cellSize,
            height: '100%',
            background: 'var(--muted, #e8e4df)',
            opacity: 0.25,
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  )
}

function SnapGhost({
  pos,
  cellId,
  cells,
  cellSize,
  gap,
}: {
  pos: GridCellPosition
  cellId: string
  cells: GridCellRecord[]
  cellSize: number
  gap: number
}) {
  const cell = cells.find((c) => c.id === cellId)
  if (!cell) return null
  const { cols: colSpan, rows: rowSpan } = bentoSizeToCols(cell.size)
  const unitW = cellSize + gap
  const width = colSpan * cellSize + (colSpan - 1) * gap
  const height = rowSpan * cellSize + (rowSpan - 1) * gap

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.col * unitW,
        top: pos.row * unitW,
        width,
        height,
        borderRadius: 'var(--capsule-radius, 14px)',
        border: '2px dashed var(--accent, #4c9fff)',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 99,
        opacity: 0.6,
      }}
    />
  )
}
