// Pure pan/zoom viewport math. Screen = container-relative px; world = canvas
// units (px at zoom 1). The plane renders with
// transform: translate(tx, ty) scale(scale), transform-origin 0 0, so:
//   screen = world * scale + t

import type { Pt } from './canvasLayout.ts'

export interface Viewport {
  tx: number
  ty: number
  scale: number
}

// Open-world zoom: no meaningful floor/ceiling. The bounds only guard against
// numeric blow-up (NaN/Infinity), not against "too far in/out" — depth is
// unlimited by design; level-of-detail culling, not a scale clamp, is what
// makes deep content fade as you pull back.
export const MIN_SCALE = 0.002
export const MAX_SCALE = 500

export function screenToWorld(vp: Viewport, p: Pt): Pt {
  return { x: (p.x - vp.tx) / vp.scale, y: (p.y - vp.ty) / vp.scale }
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Viewport that frames `bounds` inside a `size` viewport with `pad` px of
 * margin, centered. Empty/degenerate bounds recenter at world origin. The fit
 * scale never zooms PAST 1:1 — a single small element frames at its own size,
 * not blown up to fill the plane.
 */
export function fitViewport(bounds: Bounds | null, size: Pt, pad = 48): Viewport {
  const w = Math.max(0, size.x - 2 * pad)
  const h = Math.max(0, size.y - 2 * pad)
  if (!bounds || !(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) {
    const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0
    const cy = bounds ? (bounds.minY + bounds.maxY) / 2 : 0
    return { scale: 1, tx: size.x / 2 - cx, ty: size.y / 2 - cy }
  }
  const bw = bounds.maxX - bounds.minX
  const bh = bounds.maxY - bounds.minY
  const raw = Math.min(w / bw, h / bh)
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(1, raw)))
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { scale, tx: size.x / 2 - cx * scale, ty: size.y / 2 - cy * scale }
}

export function worldToScreen(vp: Viewport, p: Pt): Pt {
  return { x: p.x * vp.scale + vp.tx, y: p.y * vp.scale + vp.ty }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, tx: vp.tx + dx, ty: vp.ty + dy }
}

/** Zoom by `factor` keeping the screen point fixed under the cursor. */
export function zoomAt(vp: Viewport, screenPt: Pt, factor: number): Viewport {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, vp.scale * factor))
  if (scale === vp.scale) return vp
  const world = screenToWorld(vp, screenPt)
  return {
    scale,
    tx: screenPt.x - world.x * scale,
    ty: screenPt.y - world.y * scale,
  }
}
