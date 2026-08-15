// Pointer drag for canvas elements: world units, no snapping. Deltas divide by
// the viewport scale so a drag feels 1:1 at any zoom. The hook reports the
// element's live WORLD center; the caller resolves the drop (hitText → group,
// hitGroup → reparent, else move).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pt } from './canvasLayout.ts'

export interface CanvasDragState {
  elementId: string
  /** Live element center in world coords. */
  world: Pt
}

export interface UseCanvasDragReturn {
  dragState: CanvasDragState | null
  startDrag: (elementId: string, startWorld: Pt, e: React.PointerEvent) => void
}

export function useCanvasDrag(
  scale: number,
  onDrop: (elementId: string, world: Pt) => void,
): UseCanvasDragReturn {
  const [dragState, setDragState] = useState<CanvasDragState | null>(null)
  const dragRef = useRef<CanvasDragState | null>(null)
  const startRef = useRef({ pointer: { x: 0, y: 0 }, world: { x: 0, y: 0 } })
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const startDrag = useCallback((elementId: string, startWorld: Pt, e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = { pointer: { x: e.clientX, y: e.clientY }, world: startWorld }
    const state = { elementId, world: startWorld }
    dragRef.current = state
    setDragState(state)
  }, [])

  useEffect(() => {
    if (!dragState) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const s = scaleRef.current || 1
      const next: CanvasDragState = {
        ...d,
        world: {
          x: startRef.current.world.x + (e.clientX - startRef.current.pointer.x) / s,
          y: startRef.current.world.y + (e.clientY - startRef.current.pointer.y) / s,
        },
      }
      dragRef.current = next
      setDragState(next)
    }
    function onUp() {
      const d = dragRef.current
      if (!d) return
      onDropRef.current(d.elementId, d.world)
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
