import { useState, useCallback } from 'react'
import type React from 'react'
import type { GridCellRecord, GridCellPosition, GridSize } from '@muralink/types'
import { bentoSizeToCols } from './BentoGrid.js'
import { sizeSpan, snap05 } from './grid/algorithm.js'
import { CellMenu, type CellMenuItem } from './CellMenu.js'

// ── Resize helpers ────────────────────────────────────────────────────────────

const MIN_SPAN = 0.5  // smallest side of a cell, in cells (0.5-cell grid)
const MAX_SPAN = 3  // largest side of a cell, in cells

function clampSpan(v: number, max: number): number {
  return Math.max(MIN_SPAN, Math.min(max, snap05(v)))
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface GridCellProps {
  cell: GridCellRecord
  cellSize: number
  gap: number
  columns?: number
  livePos?: GridCellPosition
  isDragging?: boolean
  isDisplaced?: boolean
  editMode?: boolean
  onDragStart?: (cellId: string, pos: GridCellPosition, e: React.PointerEvent) => void
  onClick?: () => void
  onEditClick?: () => void
  onResize?: (cellId: string, newSize: GridSize) => void
  /** Returns the header ⋯ menu items for this cell. Empty/absent hides the ⋯ button. */
  getCellMenu?: (cell: GridCellRecord) => CellMenuItem[]
  children: React.ReactNode
  style?: React.CSSProperties
}

// ── Resize corner handle ──────────────────────────────────────────────────────

function ResizeHandle({
  cell,
  cellSize,
  gap,
  columns = 6,
  onResize,
  onResizingChange,
}: {
  cell: GridCellRecord
  cellSize: number
  gap: number
  columns: number
  onResize?: (cellId: string, newSize: GridSize) => void
  onResizingChange?: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<{ cols: number; rows: number } | null>(null)
  const unitW = cellSize + gap

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onResize) return
      const resize = onResize
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      onResizingChange?.(true)

      const { cols: startCols, rows: startRows } = sizeSpan(cell.size)
      const startX = e.clientX
      const startY = e.clientY

      // Room to the right edge caps width; height is capped at MAX_SPAN.
      const maxCols = Math.min(MAX_SPAN, columns - cell.position.col)

      // Snap the dragged span to the nearest 0.5-cell step.
      function target(ev: PointerEvent): { cols: number; rows: number } {
        const cols = clampSpan(startCols + (ev.clientX - startX) / unitW, maxCols)
        const rows = clampSpan(startRows + (ev.clientY - startY) / unitW, MAX_SPAN)
        return { cols, rows }
      }

      function onMove(ev: PointerEvent) {
        setDraft(target(ev))
      }

      function onUp(ev: PointerEvent) {
        const { cols, rows } = target(ev)
        resize(cell.id, `${cols}x${rows}`)
        setDraft(null)
        onResizingChange?.(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [cell, unitW, columns, onResize, onResizingChange],
  )

  const { cols: draftCols, rows: draftRows } = draft
    ? draft
    : sizeSpan(cell.size)

  const { cols: currentCols, rows: currentRows } = sizeSpan(cell.size)
  const draftW = draftCols * cellSize + (draftCols - 1) * gap
  const draftH = draftRows * cellSize + (draftRows - 1) * gap
  const currW = currentCols * cellSize + (currentCols - 1) * gap
  const currH = currentRows * cellSize + (currentRows - 1) * gap

  return (
    <>
      {/* Live draft size preview overlay */}
      {draft && (draft.cols !== currentCols || draft.rows !== currentRows) && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: draftW,
            height: draftH,
            borderRadius: 'var(--capsule-radius, 14px)',
            border: '2px dashed var(--accent, #4c9fff)',
            background: 'rgba(76, 159, 255, 0.08)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 200,
          }}
        />
      )}

      {/* The actual handle grip — bottom-right corner */}
      <div
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 16,
          height: 16,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.25)',
          cursor: 'nwse-resize',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={`Resize (${currW}×${currH})`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="rgba(255,255,255,0.7)">
          <path d="M7 1v6H1" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <circle cx="7" cy="7" r="1.2"/>
        </svg>
      </div>
    </>
  )
}

// ── GridCell ──────────────────────────────────────────────────────────────────

export function GridCell({
  cell,
  cellSize,
  gap,
  columns = 6,
  livePos,
  isDragging = false,
  isDisplaced = false,
  editMode = false,
  onDragStart,
  onClick,
  onEditClick,
  onResize,
  getCellMenu,
  children,
  style,
}: GridCellProps) {
  const [hovered, setHovered] = useState(false)
  // Kept true for the whole resize gesture so the handle survives the pointer
  // leaving the cell bounds while dragging the corner outward.
  const [resizing, setResizing] = useState(false)
  // Viewport anchor for the header ⋯ menu while open, else null.
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const menuItems = getCellMenu?.(cell) ?? []

  const { cols: colSpan, rows: rowSpan } = bentoSizeToCols(cell.size)
  const unitW = cellSize + gap
  const pos = livePos ?? cell.position

  const width = colSpan * cellSize + (colSpan - 1) * gap
  const height = rowSpan * cellSize + (rowSpan - 1) * gap

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={!editMode ? onClick : undefined}
      style={{
        position: 'absolute',
        left: pos.col * unitW,
        top: pos.row * unitW,
        width,
        height,
        borderRadius: 'var(--capsule-radius, 14px)',
        background: 'var(--bg, #f9f7f4)',
        border: `1px solid ${editMode && hovered ? 'var(--accent, #4c9fff)' : 'var(--border, #d4cfc9)'}`,
        overflow: editMode || hovered || resizing ? 'visible' : 'hidden',
        boxSizing: 'border-box',
        cursor: editMode ? 'default' : onClick ? 'pointer' : 'default',
        userSelect: 'none',
        transition: isDragging
          ? 'none'
          : isDisplaced
            ? 'left 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'left 0.15s ease, top 0.15s ease, border-color 0.15s',
        zIndex: isDragging ? 100 : isDisplaced ? 50 : 1,
        willChange: isDragging || isDisplaced ? 'left, top' : 'auto',
        ...style,
      }}
    >
      {/* Clip the content inside rounded corners separately from the resize overlay */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }}>
        {children}
      </div>

      {/* Edit mode: transparent shield prevents child-click accidents */}
      {editMode && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Edit mode: drag handle + pencil bar (fades in on hover) */}
      {editMode && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px 0 8px',
            gap: 4,
            opacity: hovered || isDragging ? 1 : 0,
            transition: 'opacity 0.15s',
            zIndex: 20,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)',
            borderRadius: 'var(--capsule-radius, 14px) var(--capsule-radius, 14px) 0 0',
            pointerEvents: hovered || isDragging ? 'auto' : 'none',
          }}
        >
          {/* Drag handle */}
          <div
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              onDragStart?.(cell.id, cell.position, e)
            }}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              color: 'rgba(255,255,255,0.65)',
              fontSize: 12,
              padding: '4px 5px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
              letterSpacing: 1,
            }}
            title="Drag to move"
          >
            ⠿⠿
          </div>

          <div style={{ flex: 1 }} />

          {/* ⋯ context menu button — grid options + module methods */}
          {menuItems.length > 0 && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMenuAnchor(
                  menuAnchor ? null : { top: r.bottom + 4, right: Math.max(4, window.innerWidth - r.right) },
                )
              }}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 5,
                color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 7px',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
              title="Widget menu"
            >
              ⋯
            </button>
          )}

          {/* Pencil / configure button */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onEditClick?.()
            }}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 5,
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 7px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              lineHeight: 1,
            }}
            title="Configure widget"
          >
            ✏
          </button>
        </div>
      )}

      {/* Resize handle — bottom-right corner, always available on hover. */}
      {(hovered || isDragging || resizing) && (
        <ResizeHandle
          cell={cell}
          cellSize={cellSize}
          gap={gap}
          columns={columns}
          onResize={onResize}
          onResizingChange={setResizing}
        />
      )}

      {/* Header ⋯ dropdown (portaled to body so it escapes the clip container) */}
      {menuAnchor && menuItems.length > 0 && (
        <CellMenu items={menuItems} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />
      )}
    </div>
  )
}
