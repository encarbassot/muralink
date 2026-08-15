// Camera for the MURAL view. One Viewport {tx,ty,scale} + a lock flag.
//
// Locked (default): the lienzo IS the viewport — scale fits LIENZO_W to the
// container width, tx = 0, wheel only scrolls ty (clamped to the measured
// column height). No zoom.
// Unlocked: exact canvas-view behavior — wheel = pan, ctrl/cmd+wheel = zoom
// at cursor, background drag = pan. Unlocking keeps the camera (continuity);
// re-locking snaps back to the fitted column.
//
// Zoom-agnostic depth: effective on-screen scale of a node is camera.scale ×
// ∏(ancestor mural.scale). CSS transform composition handles rendering; this
// hook only owns the ROOT transform. Composed scales beyond ~1e±6 hit float
// precision — accepted for v1. Future: re-root the camera onto a deep node
// and render only its subtree (same trick as this module's canonical-origin
// doc grid: rebasing without rewriting data).

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { Pt } from '../canvasLayout.ts'
import { panBy, screenToWorld, zoomAt, type Viewport } from '../canvasViewport.ts'
import { LIENZO_W } from './muralPlacement.ts'

function loadLock(muralId: string): boolean {
  return localStorage.getItem(`murales:mural-lock:${muralId}`) !== 'unlocked'
}

export interface UseMuralCameraReturn {
  viewport: Viewport
  locked: boolean
  toggleLock: () => void
  /** Client event → root lienzo units. */
  toLienzo: (e: { clientX: number; clientY: number }) => Pt
  planeStyle: CSSProperties
  bindBackground: { onPointerDown: (e: React.PointerEvent) => void }
  /** Re-fit the locked framing (also used by the ⛶ button when unlocked). */
  refit: () => void
}

export function useMuralCamera(
  muralId: string,
  containerRef: RefObject<HTMLElement | null>,
  /** The root frame element — its unscaled offsetHeight is the column height. */
  frameRef: RefObject<HTMLElement | null>,
): UseMuralCameraReturn {
  const [locked, setLocked] = useState(() => loadLock(muralId))
  const [viewport, setViewport] = useState<Viewport>({ tx: 0, ty: 0, scale: 1 })
  const vpRef = useRef(viewport)
  vpRef.current = viewport
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  // Measured sizes (container px / frame local units). 0 until observed —
  // wheel clamps to 0 until then.
  const sizesRef = useRef({ cw: 0, ch: 0, contentH: 0 })

  useEffect(() => {
    setLocked(loadLock(muralId))
  }, [muralId])

  function fitLocked() {
    const { cw } = sizesRef.current
    if (!cw) return
    setViewport((vp) => ({ tx: 0, ty: Math.min(0, vp.ty), scale: cw / LIENZO_W }))
  }

  function clampTy(ty: number): number {
    const { ch, contentH, cw } = sizesRef.current
    if (!cw || !contentH) return Math.min(0, ty)
    const scale = cw / LIENZO_W
    const min = Math.min(0, ch - contentH * scale)
    return Math.max(min, Math.min(0, ty))
  }

  // Observe container + root frame sizes.
  useEffect(() => {
    const container = containerRef.current
    const frame = frameRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      sizesRef.current.cw = rect.width
      sizesRef.current.ch = rect.height
      if (frame) sizesRef.current.contentH = frame.offsetHeight
      if (lockedRef.current) fitLocked()
    })
    ro.observe(container)
    if (frame) ro.observe(frame)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, frameRef, locked])

  function toScreen(e: { clientX: number; clientY: number }): Pt {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  // Wheel: non-passive so preventDefault stops page scroll/zoom.
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (lockedRef.current) {
        setViewport((vp) => ({ ...vp, ty: clampTy(vp.ty - e.deltaY) }))
        return
      }
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
  }, [containerRef])

  const bindBackground = {
    onPointerDown(e: React.PointerEvent) {
      if (lockedRef.current) return
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

  function toggleLock() {
    setLocked((prev) => {
      const next = !prev
      localStorage.setItem(`murales:mural-lock:${muralId}`, next ? 'locked' : 'unlocked')
      if (next) fitLocked() // re-lock snaps back to the fitted column
      // unlock keeps the current camera — continuity
      return next
    })
  }

  return {
    viewport,
    locked,
    toggleLock,
    toLienzo: (e) => screenToWorld(vpRef.current, toScreen(e)),
    refit: fitLocked,
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
