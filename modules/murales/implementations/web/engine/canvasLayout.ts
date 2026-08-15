// Pure canvas-view geometry over the element tree. World units = px at zoom 1.
// Canvas coordinates are each element's CENTER in its parent's frame; these
// helpers convert frames, hit-test containment (Venn-style nesting) and apply
// the structural drops (reparent, text-onto-text group creation).

import type { CanvasPlacement, MuralElement, MuralElementKind } from '../../../types.ts'
import { childrenOf, isDescendant, reorderSibling, subtreeIds } from './muralTree.ts'
import { isColumn } from './packLayout.ts'
import {
  DEFAULT_COLUMN_W,
  DEFAULT_GROUP_R,
  DEFAULT_TEXT_W,
  densidad,
  nominalArea,
  plainLength,
  sizeForNewChild,
} from './semantics.ts'

export type ColumnPlace = 'above' | 'below'

export interface Pt {
  x: number
  y: number
}

const byId = (els: MuralElement[]) => new Map(els.map((e) => [e.id, e]))

/** Element center in WORLD coords: sum of offsets up the parent chain. */
export function worldCenterOf(els: MuralElement[], id: string): Pt {
  const map = byId(els)
  let x = 0
  let y = 0
  let cur = map.get(id)
  while (cur) {
    x += cur.canvas.x
    y += cur.canvas.y
    cur = cur.parentId !== undefined ? map.get(cur.parentId) : undefined
  }
  return { x, y }
}

/** A group's circle in world coords. */
export function circleOf(els: MuralElement[], group: MuralElement): { cx: number; cy: number; r: number } {
  const c = worldCenterOf(els, group.id)
  return { cx: c.x, cy: c.y, r: group.canvas.r ?? DEFAULT_GROUP_R }
}

/** A column group's card rectangle in world coords (w/h written by the pack). */
export function columnRectOf(els: MuralElement[], group: MuralElement): { cx: number; cy: number; w: number; h: number } {
  const c = worldCenterOf(els, group.id)
  return { cx: c.x, cy: c.y, w: group.canvas.w ?? DEFAULT_COLUMN_W, h: group.canvas.h ?? DEFAULT_COLUMN_W }
}

/** A text/file element's box in world coords (nominal height when h absent). */
export function boxOf(els: MuralElement[], el: MuralElement): { cx: number; cy: number; w: number; h: number } {
  const c = worldCenterOf(els, el.id)
  const w = el.canvas.w ?? DEFAULT_TEXT_W
  const h = el.canvas.h ?? w * 0.62
  return { cx: c.x, cy: c.y, w, h }
}

/** World AABB enclosing every element's rendered extent, or null if empty. */
export function worldBounds(els: MuralElement[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (els.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of els) {
    if (el.kind === 'group' && isColumn(el)) {
      const { cx, cy, w, h } = columnRectOf(els, el)
      minX = Math.min(minX, cx - w / 2); maxX = Math.max(maxX, cx + w / 2)
      minY = Math.min(minY, cy - h / 2); maxY = Math.max(maxY, cy + h / 2)
    } else if (el.kind === 'group') {
      const { cx, cy, r } = circleOf(els, el)
      minX = Math.min(minX, cx - r); maxX = Math.max(maxX, cx + r)
      minY = Math.min(minY, cy - r); maxY = Math.max(maxY, cy + r)
    } else {
      const { cx, cy, w, h } = boxOf(els, el)
      minX = Math.min(minX, cx - w / 2); maxX = Math.max(maxX, cx + w / 2)
      minY = Math.min(minY, cy - h / 2); maxY = Math.max(maxY, cy + h / 2)
    }
  }
  return { minX, minY, maxX, maxY }
}

function treeDepth(map: Map<string, MuralElement>, id: string): number {
  let d = 0
  let cur = map.get(id)?.parentId
  while (cur !== undefined) {
    d++
    cur = map.get(cur)?.parentId
  }
  return d
}

/** Deepest group containing p, excluding the dragged subtree. Circles test
 *  radially, column cards test as rectangles. Depth ties resolve to the
 *  smaller container (innermost visual); effective radius = half the diagonal. */
export function hitGroup(els: MuralElement[], p: Pt, excludeId?: string): string | undefined {
  const excluded = excludeId ? subtreeIds(els, excludeId) : new Set<string>()
  const map = byId(els)
  let best: { id: string; depth: number; r: number } | undefined
  for (const el of els) {
    if (el.kind !== 'group' || excluded.has(el.id)) continue
    let eff: number
    if (isColumn(el)) {
      const { cx, cy, w, h } = columnRectOf(els, el)
      if (Math.abs(p.x - cx) > w / 2 || Math.abs(p.y - cy) > h / 2) continue
      eff = Math.hypot(w, h) / 2
    } else {
      const { cx, cy, r } = circleOf(els, el)
      const dx = p.x - cx
      const dy = p.y - cy
      if (dx * dx + dy * dy > r * r) continue
      eff = r
    }
    const depth = treeDepth(map, el.id)
    if (!best || depth > best.depth || (depth === best.depth && eff < best.r)) {
      best = { id: el.id, depth, r: eff }
    }
  }
  return best?.id
}

/** Topmost static markdown box containing p (deepest in tree, then latest in
 *  array), excluding the dragged subtree. For text-onto-text group creation. */
export function hitText(els: MuralElement[], p: Pt, excludeId?: string): string | undefined {
  const excluded = excludeId ? subtreeIds(els, excludeId) : new Set<string>()
  const map = byId(els)
  let best: { id: string; depth: number; idx: number } | undefined
  els.forEach((el, idx) => {
    if (el.kind !== 'markdown' || excluded.has(el.id)) return
    const { cx, cy, w, h } = boxOf(els, el)
    if (Math.abs(p.x - cx) > w / 2 || Math.abs(p.y - cy) > h / 2) return
    const depth = treeDepth(map, el.id)
    if (!best || depth > best.depth || (depth === best.depth && idx > best.idx)) {
      best = { id: el.id, depth, idx }
    }
  })
  return best?.id
}

/** Topmost non-group block (markdown/file/mural-ref) whose box contains p,
 *  excluding the dragged subtree. Deepest in tree, then latest in array. */
export function hitBlock(els: MuralElement[], p: Pt, excludeId?: string): string | undefined {
  const excluded = excludeId ? subtreeIds(els, excludeId) : new Set<string>()
  const map = byId(els)
  let best: { id: string; depth: number; idx: number } | undefined
  els.forEach((el, idx) => {
    if (el.kind === 'group' || excluded.has(el.id)) return
    const { cx, cy, w, h } = boxOf(els, el)
    if (Math.abs(p.x - cx) > w / 2 || Math.abs(p.y - cy) > h / 2) return
    const depth = treeDepth(map, el.id)
    if (!best || depth > best.depth || (depth === best.depth && idx > best.idx)) {
      best = { id: el.id, depth, idx }
    }
  })
  return best?.id
}

export interface ColumnSlot {
  /** The block the pointer is over. */
  anchorId: string
  /** Set when the anchor already lives in a column — insert into that column. */
  parentColumnId?: string
  /** Which side of the anchor the dragged block lands on. */
  place: ColumnPlace
}

/** Resolve a snap slot: the block under the pointer + which side (above/below,
 *  by the pointer's half of the box). null when the pointer is over no block. */
export function hitColumnSlot(els: MuralElement[], world: Pt, excludeId?: string): ColumnSlot | null {
  const anchorId = hitBlock(els, world, excludeId)
  if (!anchorId) return null
  const anchor = els.find((e) => e.id === anchorId)!
  const { cy } = boxOf(els, anchor)
  const place: ColumnPlace = world.y < cy ? 'above' : 'below'
  const parent = anchor.parentId !== undefined ? els.find((e) => e.id === anchor.parentId) : undefined
  return { anchorId, parentColumnId: parent && isColumn(parent) ? parent.id : undefined, place }
}

/**
 * Snap two loose blocks into a NEW column (markdown-document stack): the group
 * takes A's tree slot / doc placement / canvas position; A and B become its
 * children in vertical order (B above or below A). Ids never change.
 */
export function makeColumnFromTexts(
  els: MuralElement[],
  staticId: string,
  draggedId: string,
  newGroupId: string,
  place: ColumnPlace,
): MuralElement[] {
  const a = els.find((e) => e.id === staticId)
  const b = els.find((e) => e.id === draggedId)
  if (!a || !b || a.id === b.id) return els
  if (a.kind === 'group' || b.kind === 'group') return els
  if (isDescendant(els, staticId, draggedId)) return els

  const group: MuralElement = {
    id: newGroupId,
    kind: 'group',
    parentId: a.parentId,
    doc: a.doc,
    canvas: { x: a.canvas.x, y: a.canvas.y, layout: 'column' },
  }
  const childA: MuralElement = { ...a, parentId: newGroupId, doc: { placement: 'flow' }, canvas: { ...a.canvas, x: 0, y: 0 } }
  const childB: MuralElement = { ...b, parentId: newGroupId, doc: { placement: 'flow' }, canvas: { ...b.canvas, x: 0, y: 0 } }
  const ordered = place === 'above' ? [childB, childA] : [childA, childB]

  const withoutB = els.filter((e) => e.id !== draggedId)
  const aIdx = withoutB.findIndex((e) => e.id === staticId)
  return [...withoutB.slice(0, aIdx), group, ...ordered, ...withoutB.slice(aIdx + 1)]
}

/**
 * Insert a dragged block into an existing column, above or below an anchor
 * member. Reparents (subtree rides along) then reorders to the target slot.
 */
export function insertIntoColumn(
  els: MuralElement[],
  movingId: string,
  columnId: string,
  anchorId: string,
  place: ColumnPlace,
): MuralElement[] {
  if (movingId === anchorId) return els
  if (isDescendant(els, columnId, movingId)) return els
  // Reparent under the column (position is irrelevant — the stack owns x/y).
  const next = reparent(els, movingId, columnId, worldCenterOf(els, anchorId))
  if (place === 'below') {
    return reorderSibling(next, movingId, anchorId)
  }
  // Above the anchor = after the anchor's previous sibling (or first).
  const siblings = next.filter((e) => e.parentId === columnId && e.id !== movingId)
  const idx = siblings.findIndex((e) => e.id === anchorId)
  const prev = idx > 0 ? siblings[idx - 1]!.id : null
  return reorderSibling(next, movingId, prev)
}

/**
 * Group a selection into a new group (circle or column) at its centroid. Only
 * the top-most selected ids are reparented — a selected child of another
 * selected element rides along with its parent. Needs ≥2 top-level selections.
 */
/**
 * Convert a group between the two groupings (block ↔ mind-map) in place: sets
 * its layout and UN-PINS its direct children so the new layout can rearrange
 * them (a mind-map spreads them; a block re-stacks them). The group itself
 * keeps its position.
 */
export function setGroupLayout(els: MuralElement[], groupId: string, layout: 'column' | 'mindmap'): MuralElement[] {
  return els.map((e) => {
    if (e.id === groupId) return { ...e, canvas: { ...e.canvas, layout } }
    if (e.parentId === groupId) return { ...e, canvas: { ...e.canvas, pinned: false } }
    return e
  })
}

export function groupElements(
  els: MuralElement[],
  ids: string[],
  newGroupId: string,
  layout: 'column' | 'mindmap',
): MuralElement[] {
  const set = new Set(ids)
  const map = byId(els)
  const tops = ids.filter((id) => {
    let cur = map.get(id)?.parentId
    while (cur !== undefined) { if (set.has(cur)) return false; cur = map.get(cur)?.parentId }
    return true
  })
  if (tops.length < 2) return els
  let cx = 0
  let cy = 0
  for (const id of tops) { const c = worldCenterOf(els, id); cx += c.x; cy += c.y }
  cx /= tops.length
  cy /= tops.length
  const group: MuralElement = {
    id: newGroupId,
    kind: 'group',
    parentId: undefined,
    doc: { placement: 'flow' },
    canvas: { x: cx, y: cy, pinned: true, layout },
  }
  let next: MuralElement[] = [...els, group]
  for (const id of tops) next = reparent(next, id, newGroupId, worldCenterOf(els, id))
  return next
}

/**
 * A column with only one child (or none) is pointless — dissolve it: the lone
 * child is promoted to the column's parent, inheriting the column's slot and
 * position, and the group is removed. Runs to a fixpoint so cascades resolve
 * (a parent column left holding a single sub-column collapses too). Circles are
 * left alone — a bubble with one child is legitimate. Idempotent.
 */
export function dissolveThinColumns(els: MuralElement[]): MuralElement[] {
  let cur = els
  for (;;) {
    const col = cur.find((e) => e.kind === 'group' && isColumn(e) && childrenOf(cur, e.id).length <= 1)
    if (!col) return cur
    const kids = childrenOf(cur, col.id)
    if (kids.length === 0) {
      cur = cur.filter((e) => e.id !== col.id)
      continue
    }
    const child = kids[0]!
    cur = cur
      .map((e) =>
        e.id === child.id
          ? {
              ...e,
              parentId: col.parentId,
              doc: col.doc,
              canvas: { ...e.canvas, x: col.canvas.x, y: col.canvas.y, pinned: col.canvas.pinned ?? e.canvas.pinned },
            }
          : e,
      )
      .filter((e) => e.id !== col.id)
  }
}

/** Convert a world point into a parent's frame (identity for root). */
export function toParentFrame(els: MuralElement[], worldPt: Pt, parentId?: string): Pt {
  if (parentId === undefined) return worldPt
  const c = worldCenterOf(els, parentId)
  return { x: worldPt.x - c.x, y: worldPt.y - c.y }
}

/**
 * Move an element under a new parent at a world position: converts the point
 * into the new parent's frame and updates parentId — but KEEPS the element's
 * position in the array, so the document order is untouched. A free canvas move
 * (reparent / drop into a bubble) is spatial only; the document order changes
 * only through an explicit connect (a column stack, which reorders afterwards
 * via reorderSibling) or a document-view reorder. Guards cycles (dropping a
 * group into its own subtree = noop). Descendants keep their relative offsets.
 */
export function reparent(
  els: MuralElement[],
  id: string,
  newParentId: string | undefined,
  worldPt: Pt,
): MuralElement[] {
  const el = els.find((e) => e.id === id)
  if (!el) return els
  if (newParentId === id) return els
  if (newParentId !== undefined && isDescendant(els, newParentId, id)) return els

  const local = toParentFrame(els, worldPt, newParentId)
  return els.map((e) =>
    e.id === id
      ? {
          ...el,
          parentId: newParentId,
          canvas: { ...el.canvas, x: local.x, y: local.y },
          // Entering a group drops root-only absolute pinning; leaving keeps flow.
          doc: newParentId !== undefined && el.doc.placement === 'absolute'
            ? { placement: 'flow' }
            : el.doc,
        }
      : e,
  )
}

/**
 * Text-onto-text drop: create a NEW group where the static text A becomes the
 * title and the dragged text B enters sized ~0.5× the parent scaled by the
 * densidad ratio. The group takes A's tree slot, doc placement and canvas
 * position; ids of A and B never change (mural:// anchors stay valid).
 */
export function makeGroupFromTexts(
  els: MuralElement[],
  staticId: string,
  draggedId: string,
  newGroupId: string,
): MuralElement[] {
  const a = els.find((e) => e.id === staticId)
  const b = els.find((e) => e.id === draggedId)
  if (!a || !b || a.id === b.id) return els
  if (a.kind !== 'markdown' || b.kind !== 'markdown') return els
  if (isDescendant(els, staticId, draggedId)) return els

  const r = Math.max(DEFAULT_GROUP_R, (a.canvas.w ?? DEFAULT_TEXT_W) * 0.8)
  const group: MuralElement = {
    id: newGroupId,
    kind: 'group',
    parentId: a.parentId,
    doc: a.doc,
    canvas: { x: a.canvas.x, y: a.canvas.y, r },
  }

  const dA = densidad(plainLength(a.text ?? ''), nominalArea(a.canvas, 'markdown'))
  const dB = densidad(plainLength(b.text ?? ''), nominalArea(b.canvas, 'markdown'))
  const titleA: MuralElement = {
    ...a,
    parentId: newGroupId,
    doc: { placement: 'flow' },
    canvas: { ...a.canvas, x: 0, y: -r * 0.45 },
  }
  const childB: MuralElement = {
    ...b,
    parentId: newGroupId,
    doc: { placement: 'flow' },
    canvas: { ...b.canvas, x: 0, y: r * 0.2, w: sizeForNewChild(2 * r, dA, dB) },
  }

  const withoutB = els.filter((e) => e.id !== draggedId)
  const aIdx = withoutB.findIndex((e) => e.id === staticId)
  return [
    ...withoutB.slice(0, aIdx),
    group,
    titleA,
    childB,
    ...withoutB.slice(aIdx + 1),
  ]
}

export const MIN_TEXT_W = 80
export const MIN_TEXT_H = 28
export const MIN_GROUP_R = 40

/**
 * Corner-handle resize. Deltas are in world units. Circles stay circles (both
 * axes average into the radius). Boxes resize FREELY on both axes — no aspect
 * lock — and always gain an explicit height so the text can grow to fill the
 * box (see fitFontScale). Column groups auto-size and aren't resized here.
 */
export function applyResize(
  canvas: CanvasPlacement,
  kind: MuralElementKind,
  dw: number,
  dh: number,
): CanvasPlacement {
  if (kind === 'group') {
    const r = canvas.r ?? 120
    return { ...canvas, r: Math.max(MIN_GROUP_R, r + (dw + dh) / 4) }
  }
  const w = canvas.w ?? DEFAULT_TEXT_W
  const h = canvas.h ?? w * 0.62
  return {
    ...canvas,
    w: Math.max(MIN_TEXT_W, w + dw),
    h: Math.max(MIN_TEXT_H, h + dh),
  }
}

const GOLDEN_ANGLE = 2.399963229728653

/** Deterministic spiral slot around the parent center for a new element. */
export function defaultCanvasPlacement(
  els: MuralElement[],
  parentId: string | undefined,
  kind: MuralElementKind,
): CanvasPlacement {
  const siblings = childrenOf(els, parentId)
  const i = siblings.length
  const parent = parentId !== undefined ? els.find((e) => e.id === parentId) : undefined
  const maxDist = parent ? (parent.canvas.r ?? DEFAULT_GROUP_R) * 0.6 : Infinity
  const step = parent ? maxDist / 3 : 90
  const dist = Math.min(step * Math.sqrt(i), maxDist)
  const angle = i * GOLDEN_ANGLE
  const base: CanvasPlacement = {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist),
  }
  if (kind === 'group') base.r = parent ? Math.min(DEFAULT_GROUP_R, maxDist) : DEFAULT_GROUP_R
  else base.w = parent ? Math.min(DEFAULT_TEXT_W, (parent.canvas.r ?? DEFAULT_GROUP_R)) : DEFAULT_TEXT_W
  return base
}
