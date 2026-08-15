// Pure geometry for the MURAL view — the recursive, zoom-agnostic canvas.
//
// There is no global unit: every element's x/y/scale live in its PARENT's
// local frame, and the browser composes the nested CSS transforms. This file
// holds the only JS-side math the view needs:
//   • lazy defaults for elements that predate the `mural` field
//   • frame-scale products (screen px per local unit of a given frame)
//   • the inverse walk (screen point → a frame's local coordinates)
// Never derive geometry from DOM rects — data + these functions only.

import type { MuralElement, MuralPlacement } from '../../../../types.ts'
import type { Pt } from '../canvasLayout.ts'
import type { Viewport } from '../canvasViewport.ts'
import { screenToWorld } from '../canvasViewport.ts'
import { DEFAULT_GROUP_R, DEFAULT_TEXT_W } from '../semantics.ts'

/** Root frame width in root ("lienzo") units. Locked camera fits this width. */
export const LIENZO_W = 1200

function byId(els: MuralElement[]): Map<string, MuralElement> {
  const m = new Map<string, MuralElement>()
  for (const e of els) m.set(e.id, e)
  return m
}

export function childrenOf(els: MuralElement[], parentId: string): MuralElement[] {
  return els.filter((e) => e.parentId === parentId)
}

/**
 * The element's mural placement, deriving a default when absent so
 * pre-existing murals render with zero migration. Canvas x/y are already
 * parent-relative center offsets in ONE coherent unit space, so scale
 * defaults to 1 (deriving scale from size ratios would double-shrink
 * children).
 */
export function muralPlacementOf(el: MuralElement): MuralPlacement {
  if (el.mural) return el.mural
  return {
    x: el.canvas.x,
    y: el.canvas.y,
    scale: 1,
    w: el.canvas.w ?? (el.kind === 'group' ? 2 * (el.canvas.r ?? DEFAULT_GROUP_R) : DEFAULT_TEXT_W),
  }
}

/** Memoizable map for one render pass. */
export function placementsOf(els: MuralElement[]): Map<string, MuralPlacement> {
  const m = new Map<string, MuralPlacement>()
  for (const e of els) m.set(e.id, muralPlacementOf(e))
  return m
}

/**
 * Loose = a ROOT element the user placed freely on the lienzo. Roots without
 * `mural` flow in the main column; stamping `mural` pulls them out, deleting
 * it returns them.
 */
export function isLoose(el: MuralElement): boolean {
  return el.parentId === undefined && el.mural !== undefined
}

/**
 * Screen px per local unit of the frame OWNED by `frameId` (undefined = the
 * root lienzo frame): camera.scale × ∏ mural.scale of the chain down to and
 * including `frameId`. This is the divisor for pointer deltas when dragging
 * something that lives INSIDE that frame.
 */
export function frameScaleOf(
  els: MuralElement[],
  frameId: string | undefined,
  cameraScale: number,
): number {
  if (frameId === undefined) return cameraScale
  const map = byId(els)
  let s = cameraScale
  let cur = map.get(frameId)
  const visited = new Set<string>()
  while (cur) {
    if (visited.has(cur.id)) break // cycle guard — corrupt tree, stop compounding
    visited.add(cur.id)
    s *= muralPlacementOf(cur).scale
    cur = cur.parentId !== undefined ? map.get(cur.parentId) : undefined
  }
  return s
}

/**
 * Screen point → local coordinates of the frame owned by `frameId`
 * (undefined = root lienzo units). Inverse of the render transform chain:
 * walk root→frame subtracting each ancestor's center and dividing by its
 * scale.
 */
export function localPointOf(
  els: MuralElement[],
  screenPt: Pt,
  vp: Viewport,
  frameId?: string,
): Pt {
  let p = screenToWorld(vp, screenPt) // root lienzo units
  if (frameId === undefined) return p
  const map = byId(els)
  // Build the ancestor chain root-first.
  const chain: MuralElement[] = []
  let cur = map.get(frameId)
  const visited = new Set<string>()
  while (cur) {
    if (visited.has(cur.id)) break
    visited.add(cur.id)
    chain.unshift(cur)
    cur = cur.parentId !== undefined ? map.get(cur.parentId) : undefined
  }
  for (const anc of chain) {
    const pl = muralPlacementOf(anc)
    p = { x: (p.x - pl.x) / pl.scale, y: (p.y - pl.y) / pl.scale }
  }
  return p
}
