import { useState, useCallback, useMemo } from 'react'
import type React from 'react'
import type { GridCellRecord, GridCellPosition, GridSize } from '@muralink/types'
import { bentoSizeToCols } from './BentoGrid.js'
import { sizeSpan, snap05 } from './grid/algorithm.js'
import { CellMenu, type CellMenuItem } from './CellMenu.js'
import { CellChromeProvider } from './CellHeader.js'

// ── Resize helpers ────────────────────────────────────────────────────────────

const MIN_SPAN = 0.5  // smallest side of a cell, in cells (0.5-cell grid)
const MAX_SPAN = 3  // largest side of a cell, in cells
const PX_SNAP = 10  // live drag preview snaps every 10px; final commit still rounds to MIN_SPAN

function clampSpan(v: number, max: number): number {
  return Math.max(MIN_SPAN, Math.min(max, snap05(v)))
}

/** The 8 grab points around a cell: 4 corners + 4 edge midpoints. */
type HandleDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: { dir: HandleDir; cursor: string; top: number | string; left: number | string }[] = [
  { dir: 'nw', cursor: 'nwse-resize', top: 0, left: 0 },
  { dir: 'n', cursor: 'ns-resize', top: 0, left: '50%' },
  { dir: 'ne', cursor: 'nesw-resize', top: 0, left: '100%' },
  { dir: 'e', cursor: 'ew-resize', top: '50%', left: '100%' },
  { dir: 'se', cursor: 'nwse-resize', top: '100%', left: '100%' },
  { dir: 's', cursor: 'ns-resize', top: '100%', left: '50%' },
  { dir: 'sw', cursor: 'nesw-resize', top: '100%', left: 0 },
  { dir: 'w', cursor: 'ew-resize', top: '50%', left: 0 },
]

interface ResizeTarget {
  col: number
  row: number
  cols: number
  rows: number
}

/** Given a drag direction and raw pixel delta, compute the new position + span.
 *  Corners move two edges at once; n/s/e/w move exactly one. The edge(s) not
 *  being dragged stay pinned — e.g. dragging `w` keeps the right edge fixed. */
function resizeTarget(
  dir: HandleDir,
  start: { col: number; row: number; cols: number; rows: number },
  dxPx: number,
  dyPx: number,
  unitW: number,
  columns: number,
): ResizeTarget {
  const snappedDx = Math.round(dxPx / PX_SNAP) * PX_SNAP
  const snappedDy = Math.round(dyPx / PX_SNAP) * PX_SNAP
  const dCols = snappedDx / unitW
  const dRows = snappedDy / unitW

  let { col, row, cols, rows } = start

  if (dir === 'e' || dir === 'ne' || dir === 'se') {
    cols = clampSpan(start.cols + dCols, Math.min(MAX_SPAN, columns - start.col))
  }
  if (dir === 'w' || dir === 'nw' || dir === 'sw') {
    const rightEdge = start.col + start.cols
    cols = clampSpan(start.cols - dCols, Math.min(MAX_SPAN, rightEdge))
    col = snap05(rightEdge - cols)
  }
  if (dir === 's' || dir === 'sw' || dir === 'se') {
    rows = clampSpan(start.rows + dRows, MAX_SPAN)
  }
  if (dir === 'n' || dir === 'nw' || dir === 'ne') {
    const bottomEdge = start.row + start.rows
    rows = clampSpan(start.rows - dRows, Math.min(MAX_SPAN, bottomEdge))
    row = snap05(bottomEdge - rows)
  }

  return { col, row, cols, rows }
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
  /** Focus/outfocus model (opt-in). When on, only the focused cell shows chrome
   *  + interactive content; others are click-to-focus. */
  focusMode?: boolean
  focused?: boolean
  onFocus?: () => void
  onDragStart?: (cellId: string, pos: GridCellPosition, e: React.PointerEvent) => void
  onClick?: () => void
  onEditClick?: () => void
  /** `newPosition` is set when a top/left handle also moved the cell's origin. */
  onResize?: (cellId: string, newSize: GridSize, newPosition?: GridCellPosition) => void
  /** Returns the header ⋯ menu items for this cell. Empty/absent hides the ⋯ button. */
  getCellMenu?: (cell: GridCellRecord) => CellMenuItem[]
  children: React.ReactNode
  style?: React.CSSProperties
}

// ── Resize handles — 4 corners + 4 edge midpoints ─────────────────────────────

function ResizeHandles({
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
  onResize?: (cellId: string, newSize: GridSize, newPosition?: GridCellPosition) => void
  onResizingChange?: (active: boolean) => void
}) {
  const [draft, setDraft] = useState<ResizeTarget | null>(null)
  const [activeDir, setActiveDir] = useState<HandleDir | null>(null)
  const unitW = cellSize + gap

  const onPointerDown = useCallback(
    (dir: HandleDir) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onResize) return
      const resize = onResize
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      onResizingChange?.(true)
      setActiveDir(dir)

      const { cols: startCols, rows: startRows } = sizeSpan(cell.size)
      const start = { col: cell.position.col, row: cell.position.row, cols: startCols, rows: startRows }
      const startX = e.clientX
      const startY = e.clientY

      function target(ev: PointerEvent): ResizeTarget {
        return resizeTarget(dir, start, ev.clientX - startX, ev.clientY - startY, unitW, columns)
      }

      function onMove(ev: PointerEvent) {
        setDraft(target(ev))
      }

      function onUp(ev: PointerEvent) {
        const { col, row, cols, rows } = target(ev)
        const moved = col !== start.col || row !== start.row
        resize(cell.id, `${cols}x${rows}`, moved ? { col, row } : undefined)
        setDraft(null)
        setActiveDir(null)
        onResizingChange?.(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [cell, unitW, columns, onResize, onResizingChange],
  )

  const { cols: currentCols, rows: currentRows } = sizeSpan(cell.size)
  const start = { col: cell.position.col, row: cell.position.row, cols: currentCols, rows: currentRows }
  const draftBox = draft ?? start

  const offsetLeft = (draftBox.col - start.col) * unitW
  const offsetTop = (draftBox.row - start.row) * unitW
  const draftW = draftBox.cols * cellSize + (draftBox.cols - 1) * gap
  const draftH = draftBox.rows * cellSize + (draftBox.rows - 1) * gap

  return (
    <>
      {/* Live draft size/position preview overlay */}
      {draft && (draft.cols !== currentCols || draft.rows !== currentRows || offsetLeft !== 0 || offsetTop !== 0) && (
        <div
          style={{
            position: 'absolute',
            top: offsetTop,
            left: offsetLeft,
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

      {/* 8 grab dots — 4 corners + 4 edge midpoints */}
      {HANDLES.map(({ dir, cursor, top, left }) => (
        <div
          key={dir}
          onPointerDown={onPointerDown(dir)}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveDir(dir)}
          onMouseLeave={() => setActiveDir((d) => (d === dir ? null : d))}
          style={{
            position: 'absolute',
            top,
            left,
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--accent, #4c9fff)',
            border: '2px solid var(--bg, #f9f7f4)',
            boxShadow: activeDir === dir ? '0 0 0 3px rgba(76, 159, 255, 0.35)' : '0 1px 2px rgba(0,0,0,0.25)',
            cursor,
            zIndex: 25,
            transition: 'box-shadow 0.1s',
          }}
          title={`Resize (${currentCols}×${currentRows})`}
        />
      ))}
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
  focusMode = false,
  focused = false,
  onFocus,
  onDragStart,
  onClick,
  onEditClick,
  onResize,
  getCellMenu,
  children,
  style,
}: GridCellProps) {
  // Kept true for the whole resize gesture so the handle survives the pointer
  // leaving the cell bounds while dragging the corner outward.
  const [resizing, setResizing] = useState(false)
  // Placement is a mode you enter deliberately, one cell at a time. Before this
  // it was ambient: every card grew eight grab dots and an invisible drag strip
  // on hover, which meant a stray drag could rearrange a dashboard you were
  // only reading, and the strip covered whatever header the widget had drawn.
  const [arranging, setArranging] = useState(false)
  // Widgets that render a <CellHeader> host the ⋯ themselves. Those that do not
  // — a bare chart, a read-only list — still need a way in, so the grid draws a
  // small fallback button for them. Counting registrations rather than assuming
  // is what lets both kinds coexist while views migrate one at a time.
  const [headers, setHeaders] = useState(0)
  const [fallbackAnchor, setFallbackAnchor] = useState<{ top: number; right: number } | null>(null)
  const registerHeader = useCallback(() => {
    setHeaders((n) => n + 1)
    return () => setHeaders((n) => n - 1)
  }, [])

  const menuItems: CellMenuItem[] = useMemo(() => [
    ...(getCellMenu?.(cell) ?? []),
    ...(onEditClick
      ? [{ id: 'configure', label: 'Configurar widget', icon: '✏', group: 'grid', onSelect: () => onEditClick() }]
      : []),
    ...(onResize || onDragStart
      ? [{
          id: 'arrange',
          label: 'Cambiar posición y tamaño',
          icon: '⤢',
          group: 'grid',
          onSelect: () => setArranging(true),
        }]
      : []),
  ], [cell, getCellMenu, onEditClick, onResize, onDragStart])

  // Focus model: the focused cell shows edit chrome + interactive content;
  // legacy editMode shows chrome + a click shield. focusMode never shields
  // (the read-only vs interactive split is handled by the widget via ctx.focused).
  const shield = editMode && !focused
  // One switch now: the drag strip and the grab dots appear together, only for
  // the cell being placed. editMode still arms every cell at once, which is what
  // the "rearrange everything" affordance in the toolbar means.
  const placing = arranging || editMode

  // Stable identity: the provider value is read by every header in the subtree,
  // and a fresh object each render would re-run their effects.
  const chromeValue = useMemo(() => ({ menuItems, registerHeader }), [menuItems, registerHeader])

  const { cols: colSpan, rows: rowSpan } = bentoSizeToCols(cell.size)
  const unitW = cellSize + gap
  const pos = livePos ?? cell.position

  const width = colSpan * cellSize + (colSpan - 1) * gap
  const height = rowSpan * cellSize + (rowSpan - 1) * gap

  return (
    <div
      data-cell-id={cell.id}
      onClick={editMode ? undefined : focusMode ? (focused ? undefined : onFocus) : onClick}
      style={{
        position: 'absolute',
        left: pos.col * unitW,
        top: pos.row * unitW,
        width,
        height,
        borderRadius: 'var(--capsule-radius, 14px)',
        background: 'var(--bg, #f9f7f4)',
        // Only a card being placed gets an accent outline. A plain hover no
        // longer lights up every border, which is what made a dashboard look
        // permanently editable.
        border: `1px solid ${focused || placing ? 'var(--accent, #4c9fff)' : 'var(--border, #d4cfc9)'}`,
        boxShadow: focused ? '0 0 0 2px var(--accent-dim, rgba(76,159,255,0.35))' : undefined,
        overflow: placing || resizing ? 'visible' : 'hidden',
        boxSizing: 'border-box',
        cursor: focusMode ? (focused ? 'default' : 'pointer') : editMode ? 'default' : onClick ? 'pointer' : 'default',
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
        <CellChromeProvider value={chromeValue}>{children}</CellChromeProvider>
      </div>

      {/* Global edit mode: transparent shield prevents child-click accidents.
          The focused cell is intentionally NOT shielded so its content stays live. */}
      {shield && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Fallback ⋯ for widgets with no header of their own. Appears on hover
          so it does not sit permanently on top of someone's content. */}
      {headers === 0 && menuItems.length > 0 && !placing && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFallbackAnchor(
              fallbackAnchor ? null : { top: r.bottom + 4, right: Math.max(4, window.innerWidth - r.right) },
            )
          }}
          title="Opciones del widget"
          aria-label="Opciones del widget"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 20,
            background: 'var(--bg-elevated, rgba(255,255,255,0.9))',
            border: '1px solid var(--border, #d4cfc9)',
            borderRadius: 6,
            color: 'var(--fg-dim, #6b6560)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: '2px 6px',
            opacity: fallbackAnchor ? 1 : 0,
            transition: 'opacity 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { if (!fallbackAnchor) (e.currentTarget as HTMLElement).style.opacity = '0' }}
        >
          ⋯
        </button>
      )}

      {fallbackAnchor && (
        <CellMenu items={menuItems} anchor={fallbackAnchor} onClose={() => setFallbackAnchor(null)} />
      )}

      {/* Placement bar. Only while placing, so it can never sit on top of a
          widget's own header — the reason it existed as an always-on strip was
          also the reason header buttons were unreachable. */}
      {placing && (
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
            gap: 6,
            zIndex: 20,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)',
            borderRadius: 'var(--capsule-radius, 14px) var(--capsule-radius, 14px) 0 0',
            pointerEvents: 'auto',
          }}
        >
          {/* The whole strip is the grab area: a 10px dotted glyph was a small
              target for the one gesture this mode exists for. */}
          <div
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              onDragStart?.(cell.id, cell.position, e)
            }}
            style={{
              flex: 1,
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: isDragging ? 'grabbing' : 'grab',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 11,
              letterSpacing: 0.2,
            }}
            title="Arrastra para mover"
          >
            <span style={{ letterSpacing: 1 }}>⠿⠿</span>
            <span>Arrastra para mover · tira de los puntos para redimensionar</span>
          </div>

          {/* Leaving the mode is explicit. editMode is driven by the toolbar, so
              a card armed that way is not something this button should switch off. */}
          {arranging && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setArranging(false)
              }}
              style={{
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 5,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 9px',
                lineHeight: 1,
              }}
            >
              Listo
            </button>
          )}
        </div>
      )}

      {/* Resize handles — 4 corners + 4 edge midpoints. In focus mode only the
          focused cell (or global edit mode) can resize; otherwise available on
          hover (legacy default). */}
      {placing && (
        <ResizeHandles
          cell={cell}
          cellSize={cellSize}
          gap={gap}
          columns={columns}
          onResize={onResize}
          onResizingChange={setResizing}
        />
      )}

    </div>
  )
}
