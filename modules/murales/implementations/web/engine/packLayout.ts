// Fluid pack layout for the canvas view. Positions are COMPUTED, not stored:
// every element that isn't manually pinned gets a place inside its parent's
// circle by a deterministic relaxation pack, and every group auto-sizes to
// hold its content. Nothing is physics — the layout is a pure function of the
// tree (sizes + sibling order + which nodes are pinned), so identical input
// gives identical output; the CANVAS animates the difference via CSS
// transitions, which reads as fluid reflow.
//
// Pinned nodes are fixed obstacles: the free pack flows AROUND them, so a user
// can drop one node in place and let the rest fill the space that's left.
//
// The result is the same element array with canvas.x/y (and group r) rewritten
// for unpinned nodes — feed it to every geometry helper (worldCenterOf,
// hitGroup, worldBounds, rendering) in place of the raw elements.

import type { MuralArrow, MuralElement } from '../../../types.ts'
import { childrenOf } from './muralTree.ts'
import { COLUMN_GAP, COLUMN_PAD, DEFAULT_COLUMN_W, DEFAULT_GROUP_R, DEFAULT_TEXT_W } from './semantics.ts'

/** A block: a group rendered as a vertical markdown-document stack. */
export function isColumn(el: MuralElement): boolean {
  return el.kind === 'group' && el.canvas.layout === 'column'
}

/** A mind-map: a group that isn't a block (force-directed bubble). `undefined`
 *  layout counts as a mind-map so pre-existing circle groups keep working. */
export function isMindmap(el: MuralElement): boolean {
  return el.kind === 'group' && el.canvas.layout !== 'column'
}

const GOLDEN_ANGLE = 2.399963229728653
const GAP = 16 // min world px between two packed items
const PAD = 24 // breathing room between content and the group's rim
const FILL = 0.5 // target area fill when estimating a group's radius
const ITERS = 70 // relaxation passes — enough to settle typical clusters
const MIN_R = DEFAULT_GROUP_R * 0.5

interface Disk {
  x: number
  y: number
  r: number
}

/** Rendered height of a leaf: a measured value (from the DOM) wins, then an
 *  explicit canvas height, then a rough estimate from the width. */
function leafHeight(el: MuralElement, heights?: Map<string, number>): number {
  return heights?.get(el.id) ?? el.canvas.h ?? (el.canvas.w ?? DEFAULT_TEXT_W) * 0.62
}

/** Push two free disks apart to remove overlap (each moves half). */
function separate(a: Disk, b: Disk): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let dist = Math.hypot(dx, dy)
  const min = a.r + b.r + GAP
  if (dist >= min) return
  // Coincident: nudge along a deterministic axis so the pass still resolves.
  if (dist < 1e-6) {
    a.x -= min / 2
    b.x += min / 2
    return
  }
  const push = (min - dist) / 2
  const ux = dx / dist
  const uy = dy / dist
  a.x -= ux * push
  a.y -= uy * push
  b.x += ux * push
  b.y += uy * push
}

/** Spring attraction along a graph edge: pull two disks toward "touching"
 *  (each moves a fraction). Only acts when they're farther than the rest gap. */
function attract(a: Disk, b: Disk): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const rest = a.r + b.r + GAP
  if (dist <= rest || dist < 1e-6) return
  const pull = (dist - rest) * 0.12
  const ux = dx / dist
  const uy = dy / dist
  a.x += ux * pull
  a.y += uy * pull
  b.x -= ux * pull
  b.y -= uy * pull
}

/** Push a free disk out of a fixed obstacle (only the free one moves). */
function separateFromObstacle(free: Disk, obst: Disk): void {
  const dx = free.x - obst.x
  const dy = free.y - obst.y
  let dist = Math.hypot(dx, dy)
  const min = free.r + obst.r + GAP
  if (dist >= min) return
  if (dist < 1e-6) {
    free.x += min
    return
  }
  const push = min - dist
  free.x += (dx / dist) * push
  free.y += (dy / dist) * push
}

/**
 * Lay out `parentId`'s children into a circle and return the radius that circle
 * needs. Recurses bottom-up (a group's size depends on its packed contents).
 * Writes computed x/y into `out` for unpinned children; leaves pinned ones and
 * their subtree offsets untouched.
 */
function layoutChildren(
  out: Map<string, MuralElement>,
  elements: MuralElement[],
  parentId: string | undefined,
  radiusOf: (id: string) => number,
  arrows?: MuralArrow[],
): number {
  const kids = childrenOf(elements, parentId)
  const items = kids.map((k) => ({ el: out.get(k.id)!, r: radiusOf(k.id) }))
  const free = items.filter((i) => !i.el.canvas.pinned)
  const pinned = items.filter((i) => i.el.canvas.pinned)

  const areaSum = items.reduce((s, i) => s + Math.PI * i.r * i.r, 0)
  const estR = Math.max(MIN_R, Math.sqrt(areaSum / (Math.PI * FILL)))

  // Seed free items on a Vogel (sunflower) spiral — even area coverage, stable
  // as the count changes — then relax to remove overlaps and stay contained.
  const N = free.length
  const disks: Disk[] = free.map((it, i) => {
    const t = N > 1 ? Math.sqrt((i + 0.5) / N) : 0
    const ang = i * GOLDEN_ANGLE
    return { x: Math.cos(ang) * t * estR * 0.9, y: Math.sin(ang) * t * estR * 0.9, r: it.r }
  })
  const obstacles: Disk[] = pinned.map((it) => ({ x: it.el.canvas.x, y: it.el.canvas.y, r: it.r }))

  // Graph edges among the FREE children of this group → spring attraction, so a
  // mind-map settles into a force-directed layout (repulsion + edge springs).
  const diskOf = new Map<string, Disk>()
  free.forEach((it, i) => diskOf.set(it.el.id, disks[i]!))
  const edges = (arrows ?? []).filter((e) => diskOf.has(e.from) && diskOf.has(e.to))

  for (let iter = 0; iter < ITERS; iter++) {
    for (const e of edges) attract(diskOf.get(e.from)!, diskOf.get(e.to)!)
    for (let a = 0; a < disks.length; a++) {
      for (let b = a + 1; b < disks.length; b++) separate(disks[a]!, disks[b]!)
      for (const o of obstacles) separateFromObstacle(disks[a]!, o)
      // Keep inside the working circle (grown to fit if pins push outward).
      const d = Math.hypot(disks[a]!.x, disks[a]!.y)
      const maxD = estR - disks[a]!.r
      if (maxD > 0 && d > maxD) {
        const s = maxD / d
        disks[a]!.x *= s
        disks[a]!.y *= s
      }
    }
  }

  free.forEach((it, i) => {
    it.el.canvas.x = Math.round(disks[i]!.x)
    it.el.canvas.y = Math.round(disks[i]!.y)
  })

  let need = 0
  for (const d of disks) need = Math.max(need, Math.hypot(d.x, d.y) + d.r)
  for (const o of obstacles) need = Math.max(need, Math.hypot(o.x, o.y) + o.r)
  return Math.max(MIN_R, need + PAD)
}

interface Size { w: number; h: number }

/**
 * Stack a column group's children vertically (sibling order = top→bottom).
 * Writes each child's centered x/y and returns the card's size. `pinned` is
 * ignored inside a column — the stack owns the geometry.
 */
function layoutColumn(
  out: Map<string, MuralElement>,
  elements: MuralElement[],
  groupId: string,
  sizeOf: (id: string) => Size,
): Size {
  const kids = childrenOf(elements, groupId)
  const sizes = kids.map((k) => sizeOf(k.id))
  const innerW = Math.max(DEFAULT_COLUMN_W, ...sizes.map((s) => s.w), 0)
  const contentH = sizes.reduce((s, sz) => s + sz.h, 0) + COLUMN_GAP * Math.max(0, kids.length - 1)
  const w = innerW + COLUMN_PAD * 2
  const h = Math.max(contentH + COLUMN_PAD * 2, COLUMN_PAD * 2)

  let y = -h / 2 + COLUMN_PAD
  kids.forEach((k, i) => {
    const sz = sizes[i]!
    const el = out.get(k.id)!
    // Left-align: child's LEFT edge sits at the card's left edge (not centered).
    el.canvas.x = Math.round((sz.w - w) / 2 + COLUMN_PAD)
    el.canvas.y = Math.round(y + sz.h / 2)
    y += sz.h + COLUMN_GAP
  })

  const g = out.get(groupId)!
  g.canvas.w = Math.round(w)
  g.canvas.h = Math.round(h)
  return { w, h }
}

/**
 * Compute the fluid layout for the whole tree. Returns a NEW element array
 * (same order, cloned canvas) with unpinned positions and auto group radii
 * filled in. Pure and deterministic.
 */
export function computeLayout(elements: MuralElement[], heights?: Map<string, number>, arrows?: MuralArrow[]): MuralElement[] {
  const out = new Map<string, MuralElement>(
    elements.map((e) => [e.id, { ...e, canvas: { ...e.canvas } }]),
  )
  const radiusCache = new Map<string, number>()

  // Rendered footprint of any element: leaves from their box, circles from 2r,
  // columns from their stacked card. Used by the column packer to size rows.
  function sizeOf(id: string): Size {
    const el = out.get(id)!
    if (el.kind !== 'group') {
      const w = el.canvas.w ?? DEFAULT_TEXT_W
      return { w, h: leafHeight(el, heights) }
    }
    if (isColumn(el)) {
      radiusOf(id) // side-effect: fills the column's w/h
      return { w: el.canvas.w ?? DEFAULT_COLUMN_W, h: el.canvas.h ?? DEFAULT_COLUMN_W }
    }
    const r = radiusOf(id)
    return { w: 2 * r, h: 2 * r }
  }

  function radiusOf(id: string): number {
    const cached = radiusCache.get(id)
    if (cached !== undefined) return cached
    const el = out.get(id)!
    if (el.kind !== 'group') {
      const w = el.canvas.w ?? DEFAULT_TEXT_W
      const r = Math.hypot(w, leafHeight(el, heights)) / 2
      radiusCache.set(id, r)
      return r
    }
    // Column: stack children, then present an enclosing radius so the OUTER
    // pack separates the whole card from its siblings as one disk.
    if (isColumn(el)) {
      const { w, h } = layoutColumn(out, elements, id, sizeOf)
      const r = Math.hypot(w, h) / 2
      radiusCache.set(id, r)
      return r
    }
    // Pinned/resized group keeps its explicit radius; its content still packs
    // inside it. Auto group grows to fit.
    const contentR = layoutChildren(out, elements, id, radiusOf, arrows)
    const r = el.canvas.pinned ? (el.canvas.r ?? contentR) : contentR
    if (!el.canvas.pinned) el.canvas.r = Math.round(r)
    radiusCache.set(id, r)
    return r
  }

  // Kick the cascade from the roots (a group child triggers its own pack).
  layoutChildren(out, elements, undefined, radiusOf, arrows)

  return elements.map((e) => out.get(e.id)!)
}
