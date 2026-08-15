// DOM wiring for the canvas viewport: wheel = pan, ctrl/cmd+wheel (trackpad
// pinch) = zoom at cursor, background drag = pan. Wheel listener is attached
// non-passive so preventDefault stops the page from scrolling/zooming.

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { Pt } from './canvasLayout.ts'
import { type Bounds, fitViewport, panBy, screenToWorld, zoomAt, type Viewport } from './canvasViewport.ts'

export interface UseCanvasViewportReturn {
  viewport: Viewport
  /** Client event → world coords. */
  toWorld: (e: { clientX: number; clientY: number }) => Pt
  planeStyle: CSSProperties
  /** Spread on the background surface to enable drag-to-pan. */
  bindBackground: { onPointerDown: (e: React.PointerEvent) => void }
  /** Frame `bounds` inside the current container, centered with margin. */
  fit: (bounds: Bounds | null) => void
}

export function useCanvasViewport(ref: RefObject<HTMLElement | null>): UseCanvasViewportReturn {
  const [viewport, setViewport] = useState<Viewport>({ tx: 0, ty: 0, scale: 1 })
  const vpRef = useRef(viewport)
  vpRef.current = viewport

  function toScreen(e: { clientX: number; clientY: number }): Pt {
    const rect = ref.current?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  useEffect(() => {
    const node = ref.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const screen = toScreen(e)
      if (e.ctrlKey || e.metaKey) {
        setViewport((vp) => zoomAt(vp, screen, Math.exp(-e.deltaY * 0.01)))
      } else {
        setViewport((vp) => panBy(vp, -e.deltaX, -e.deltaY))
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  const bindBackground = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return
      if (e.target !== e.currentTarget) return // only true background
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      let last = { x: e.clientX, y: e.clientY }
      function onMove(ev: PointerEvent) {
        setViewport((vp) => panBy(vp, ev.clientX - last.x, ev.clientY - last.y))
        last = { x: ev.clientX, y: ev.clientY }
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
  }

  function fit(bounds: Bounds | null) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setViewport(fitViewport(bounds, { x: rect.width, y: rect.height }))
  }

  return {
    viewport,
    toWorld: (e) => screenToWorld(vpRef.current, toScreen(e)),
    fit,
    planeStyle: {
      position: 'absolute',
      top: 0,
      left: 0,
      transform: `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`,
      transformOrigin: '0 0',
    },
    bindBackground,
  }
}
