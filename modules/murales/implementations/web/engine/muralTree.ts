// Pure tree helpers over the flat elements array (tree via parentId).
// Sibling order = order of appearance in the flat array.

import type { MuralElement } from '../../../types.ts'

export function childrenOf(els: MuralElement[], parentId?: string): MuralElement[] {
  return els.filter((e) => e.parentId === parentId)
}

export function rootsOf(els: MuralElement[]): MuralElement[] {
  return els.filter((e) => e.parentId === undefined)
}

/** True when `id` is inside the subtree rooted at `ancestorId` (excl. itself). */
export function isDescendant(els: MuralElement[], id: string, ancestorId: string): boolean {
  const byId = new Map(els.map((e) => [e.id, e]))
  let cur = byId.get(id)?.parentId
  while (cur !== undefined) {
    if (cur === ancestorId) return true
    cur = byId.get(cur)?.parentId
  }
  return false
}

/** The element plus every descendant, as a set of ids. */
export function subtreeIds(els: MuralElement[], id: string): Set<string> {
  const ids = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const e of els) {
      if (e.parentId !== undefined && ids.has(e.parentId) && !ids.has(e.id)) {
        ids.add(e.id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Move an element to a position among its parent's siblings without touching
 * other parents' runs: removes it and re-inserts it directly after
 * `afterSiblingId` (or before all siblings when null). Operates on the flat
 * array, preserving every other element's relative order.
 */
export function reorderSibling(
  els: MuralElement[],
  id: string,
  afterSiblingId: string | null,
): MuralElement[] {
  const moving = els.find((e) => e.id === id)
  if (!moving) return els
  const rest = els.filter((e) => e.id !== id)
  if (afterSiblingId === null) {
    // Before the first sibling of the same parent (or at array start).
    const firstIdx = rest.findIndex((e) => e.parentId === moving.parentId)
    const at = firstIdx === -1 ? rest.length : firstIdx
    return [...rest.slice(0, at), moving, ...rest.slice(at)]
  }
  const anchorIdx = rest.findIndex((e) => e.id === afterSiblingId)
  if (anchorIdx === -1) return els
  return [...rest.slice(0, anchorIdx + 1), moving, ...rest.slice(anchorIdx + 1)]
}
