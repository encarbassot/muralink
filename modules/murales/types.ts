// murales module types — v2 (multi-view).
//
// A mural is one embedded document: a FLAT array of elements forming a TREE
// via parentId. Each element stores intrinsic positions for every view:
//   • doc    — the document view (vertical flow / fractional-grid absolute)
//   • canvas — the mind-map canvas (free x/y, groups are circles)
//   • mural  — the recursive zoom-agnostic canvas (optional; lazy defaults)
// Editing one view never rewrites the other view's intrinsics; the shared
// tree (parentId + sibling order) is the semantic bridge between views.
//
// Canvas coordinates are the element's CENTER in its PARENT's frame: world
// units (px at zoom 1) for roots, offset from the parent circle's center for
// children — so dragging a group moves its subtree for free.
//
// Canonical doc coordinates never move: the document origin is (0,0) forever.
// Unlocking the grid only grows render extents (columns left/right, rows
// above), so re-locking never rewrites data.
//
// Cross-mural references (fase 2) use standard markdown links with an internal
// scheme: [Texto](mural://<muralId>) and [Bloque](mural://<muralId>#<elementId>).
// Element ids are stable, also across group creation — keep them.

export type MuralElementKind = 'group' | 'markdown' | 'file' | 'mural-ref'

export interface MuralAbsolutePlacement {
  /** Fractional column units on the 0.5 lattice. Negative when unlocked-left. */
  x: number
  /** Fractional row units. Negative = rows above the document (unlocked-up). */
  y: number
  /** Width in columns, 0.5 steps. */
  w: number
  /** Fixed height in row units; absent = auto height (content-sized). */
  h?: number
}

export interface DocPlacement {
  /** 'absolute' is only honored for root elements (v1); children always flow. */
  placement: 'flow' | 'absolute'
  /** Required when placement === 'absolute'. */
  abs?: MuralAbsolutePlacement
}

export interface CanvasPlacement {
  /** Center X in the parent's frame (world px for roots). */
  x: number
  /** Center Y in the parent's frame. */
  y: number
  /** kind 'group': circle radius. */
  r?: number
  /** markdown/file: box width; height auto unless h given. */
  w?: number
  h?: number
  /**
   * kind 'group' only. Two first-class groupings:
   *   'column'  = a block: a vertical markdown-document stack (children flow
   *               top→bottom in sibling order; w/h are the computed card size).
   *   'mindmap' = a soft group: children packed as a force-directed graph
   *               (repulsion + edge springs) inside a bubble. `undefined` ≡
   *               mindmap, so pre-existing circle groups keep working.
   */
  layout?: 'column' | 'mindmap'
  /**
   * Manual override. Unpinned elements are positioned (and groups auto-sized)
   * by the fluid pack layout — they reflow to fill available space. Pinning
   * (set when the user drags an element) freezes x/y (and r) so the pack flows
   * AROUND it instead of over it. Cleared by "auto-ordenar".
   */
  pinned?: boolean
}

/**
 * Placement in the MURAL view (the recursive, zoom-agnostic canvas). Position
 * AND scale are relative to the PARENT's local frame — there is no global
 * unit. An element defines its own local frame: it lays out in the parent's
 * units and shrinks by `scale` into its own. Absent = the view derives a
 * default lazily (root flow elements form the main column; nested elements
 * inherit their canvas x/y with scale 1) — pre-existing murals need no
 * migration.
 */
export interface MuralPlacement {
  /** Center X in the parent's local frame (root: lienzo units). */
  x: number
  /** Center Y in the parent's local frame. */
  y: number
  /**
   * This element's frame size relative to its parent's — the datum the canvas
   * model lacks. 1 = same scale as the parent; 0.01 = a hundred times smaller.
   * Effective on-screen scale = camera.scale × ∏(ancestor scales) × scale.
   */
  scale: number
  /** Box width in the element's OWN local units; height is content-auto. */
  w?: number
  /** Future: anchored columns (fase 2). Ignored in v1. */
  anchored?: boolean
}

export interface MuralFileRef {
  /** Storage path under murales/<muralId>/, served via /api/storage/serve. */
  path: string
  name: string
  size: number
  mime?: string
}

export interface MuralElement {
  id: string
  kind: MuralElementKind
  /** Tree: undefined = root. Sibling flow order = array order (filtered by parentId). */
  parentId?: string
  /** kind 'markdown': the chunk's raw markdown source. */
  text?: string
  /** kind 'file'. */
  file?: MuralFileRef
  /** kind 'mural-ref' (future): target mural id. */
  refId?: string
  doc: DocPlacement
  /** Always stamped at creation (defaultCanvasPlacement). */
  canvas: CanvasPlacement
  /** Mural-view placement; absent = derived lazily (see MuralPlacement). */
  mural?: MuralPlacement
}

export interface MuralArrow {
  id: string
  from: string
  to: string
  label?: string
}

export interface MuralGridConfig {
  locked: boolean
  /** Base columns, default 5. */
  columns: number
  /** Extra columns left of the origin (unlocked), default 0. */
  extendLeft: number
  /** Extra columns right of `columns` (unlocked), default 0. */
  extendRight: number
  /** Extra rows above the origin (unlocked), default 0. */
  extendUp: number
  /** Pixels per row unit in the absolute layer, default 48. */
  rowUnit: number
}

export interface YMural {
  id: string
  title: string
  /** Icon shown in cards and headers; picked (or randomized) at creation. */
  emoji?: string
  /** Flat array; tree via parentId. Sibling order = flow/document order. */
  elements: MuralElement[]
  /** Canvas arrows (model persisted now; UI is a later phase). */
  arrows?: MuralArrow[]
  grid: MuralGridConfig
  /** Shared link readable without a signed-in account. */
  public?: boolean
  createdBy?: string
  updatedAt: string
  // Which storage space currently holds this mural (runtime-only, stamped on
  // read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}

export function defaultGrid(): MuralGridConfig {
  return { locked: true, columns: 5, extendLeft: 0, extendRight: 0, extendUp: 0, rowUnit: 48 }
}
