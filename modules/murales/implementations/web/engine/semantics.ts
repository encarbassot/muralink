// Semantic spectrum shared by every view. "Densidad" is the ratio between how
// much text an element carries and how much space it occupies — a CONTINUOUS
// value, never a binary title/text switch. Both the document view (group
// section headings) and the canvas view (text font size) derive their scale
// from the same functions, so an element reads the same across views.
//
// Densidad is always computed, never stored: it changes with every keystroke
// and every resize.

import type { CanvasPlacement, MuralElement, MuralElementKind } from '../../../types.ts'

/** Default sizes used when a placement lacks explicit dimensions. */
export const DEFAULT_TEXT_W = 180
export const DEFAULT_GROUP_R = 120
const TEXT_ASPECT = 0.62

/** Column (markdown-document) group geometry. Children stack vertically, flush:
 *  no padding, no gap — the stack reads as one seamless document. */
export const DEFAULT_COLUMN_W = 240 // inner content width of a column card
export const COLUMN_GAP = 0 // world px between stacked children
export const COLUMN_PAD = 0 // padding between the card rim and its content

/** Nominal world area of an element: group → π·r², text/file → w·(h ?? w·0.62). */
export function nominalArea(c: CanvasPlacement, kind: MuralElementKind): number {
  if (kind === 'group') {
    const r = c.r ?? DEFAULT_GROUP_R
    return Math.PI * r * r
  }
  const w = c.w ?? DEFAULT_TEXT_W
  const h = c.h ?? w * TEXT_ASPECT
  return w * h
}

/** Plain-text length of markdown: strips heading/list/emphasis syntax, link
 *  targets and fence markers so densidad measures CONTENT, not notation. */
export function plainLength(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .trim().length
}

/** Chars per kilo-px² of world area. ~0–2 reads title-ish, ~5+ reads body. */
export function densidad(textLen: number, area: number): number {
  return textLen / Math.max(area / 1000, 0.001)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Continuous title↔body font scale (em multiplier). Monotonically decreasing
 *  with densidad; never a hard switch. */
export function fontScaleFor(d: number): number {
  return clamp(2.2 - 0.55 * Math.log2(1 + d), 0.8, 2.2)
}

/**
 * Font scale for a CANVAS text box. Two factors compose:
 *   • content: the densidad continuum evaluated at the DEFAULT box size, so
 *     short thoughts read title-ish and long ones body-ish regardless of size;
 *   • geometry: linear with the box width, so resizing the rectangle scales
 *     the text to fill (or shrink into) it.
 */
export function canvasFontScale(textLen: number, w: number): number {
  const baseArea = DEFAULT_TEXT_W * DEFAULT_TEXT_W * 0.62
  return fontScaleFor(densidad(textLen, baseArea)) * (w / DEFAULT_TEXT_W)
}

/**
 * Font scale (em) that makes ~textLen characters fill a w×h box as large as
 * possible. A box holds ≈ w·h / (charArea·em²) characters, so inverting gives
 * em ≈ √(w·h / (len·charArea)). CHAR_AREA is tuned so a default 180×112 box with
 * ~30 chars lands near the width-based canvasFontScale. Used for resized boxes.
 */
const CHAR_AREA = 306
export function fitFontScale(textLen: number, w: number, h: number): number {
  const scale = Math.sqrt((w * h) / (Math.max(textLen, 8) * CHAR_AREA))
  return clamp(scale, 0.6, 4)
}

/** Max plain length for a text to be a title CANDIDATE (still a continuum for
 *  sizing — this only gates who may claim the title slot). */
export const TITLE_MAX_LEN = 120

/**
 * The immediate markdown child that reads as the group's title, or null.
 * Candidates: single-block texts (no blank lines) with plainLength ≤ 120;
 * winner = lowest densidad relative to the GROUP's area; ties resolve to the
 * earliest sibling.
 */
export function groupTitle(group: MuralElement, children: MuralElement[]): string | null {
  const area = nominalArea(group.canvas, 'group')
  let best: { id: string; d: number } | null = null
  for (const child of children) {
    if (child.kind !== 'markdown') continue
    const text = child.text ?? ''
    const len = plainLength(text)
    if (len === 0 || len > TITLE_MAX_LEN) continue
    if (/\n\s*\n/.test(text.trim())) continue // multi-block = body, not title
    const d = densidad(len, area)
    if (!best || d < best.d) best = { id: child.id, d }
  }
  return best?.id ?? null
}

/**
 * Width for a dragged text B entering a group whose title is text A
 * (text-onto-text group creation): ~half the parent, scaled by the densidad
 * ratio so denser content gets relatively less room.
 */
export function sizeForNewChild(parentW: number, dParent: number, dChild: number): number {
  return 0.5 * parentW * clamp(dParent / Math.max(dChild, 0.001), 0.6, 1.4)
}
