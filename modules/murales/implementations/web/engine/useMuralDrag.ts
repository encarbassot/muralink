// Pointer drag for mural elements. Modeled on @muralink/ui useGridDrag but
// with per-axis units (responsive column width vs fixed row unit) and mural
// semantics: dragging works in render-space columns/rows, the hook converts to
// canonical coordinates on drop, clamping when the grid is locked.

import { useCallback, useEffect, useRef, useState } from 'react'
import { computeSnapPosition, snap05 } from '@muralink/ui'
import type { MuralGridConfig } from '../../../types.ts'
import { clampLocked, originOffset } from './muralLayout.ts'

export interface MuralDragState {
  elementId: string
  /** Render-space position (grid units, origin at canvas top-left). */
  current: { x: number; y: number }
  /** Snapped render-space target, when within the snap threshold. */
  snapTarget: { x: number; y: number } | null
  w: number
}

export interface UseMuralDragReturn {
  dragState: MuralDragState | null
  /**
   * Begin dragging an element. `startRender` is the element's current
   * render-space position in grid units (for flow elements: their DOM offset
   * converted by the caller).
   */
  startDrag: (
    elementId: string,
    startRender: { x: number; y: number },
    w: number,
    e: React.PointerEvent,
  ) => void
}

export function useMuralDrag(
  grid: MuralGridConfig,
  colW: number,
  onDrop: (elementId: string, canonical: { x: number; y: number }) => void,
  snapThreshold = 1 / 3,
): UseMuralDragReturn {
  const [dragState, setDragState] = useState<MuralDragState | null>(null)

  const dragRef = useRef<MuralDragState | null>(null)
  const startRef = useRef({ pointer: { x: 0, y: 0 }, pos: { x: 0, y: 0 } })
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const configRef = useRef({ grid, colW, snapThreshold })
  configRef.current = { grid, colW, snapThreshold }

  const startDrag = useCallback(
    (elementId: string, startRender: { x: number; y: number }, w: number, e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      startRef.current = { pointer: { x: e.clientX, y: e.clientY }, pos: startRender }
      const state: MuralDragState = {
        elementId,
        current: startRender,
        snapTarget: { x: snap05(startRender.x), y: snap05(startRender.y) },
        w,
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
      const { grid, colW, snapThreshold } = configRef.current

      const rawX = startRef.current.pos.x + (e.clientX - startRef.current.pointer.x) / colW
      const rawY = startRef.current.pos.y + (e.clientY - startRef.current.pointer.y) / grid.rowUnit

      const { col, row, isSnapped } = computeSnapPosition(rawX, rawY, snapThreshold)

      const next: MuralDragState = {
        ...d,
        current: { x: col, y: row },
        snapTarget: isSnapped ? { x: snap05(col), y: snap05(row) } : null,
      }
      dragRef.current = next
      setDragState(next)
    }

    function onUp() {
      const d = dragRef.current
      if (!d) return
      const { grid } = configRef.current
      const origin = originOffset(grid)
      const finalRender = d.snapTarget ?? { x: snap05(d.current.x), y: snap05(d.current.y) }
      // Render space → canonical (origin translation), then clamp if locked.
      let canonical = { x: finalRender.x - origin.col, y: finalRender.y - origin.row }
      if (grid.locked) canonical = clampLocked(canonical, d.w, grid)
      onDropRef.current(d.elementId, canonical)
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
