// Pure layout helpers for the mural engine. No React, unit-testable.
//
// Coordinate model: canonical element coordinates keep the document origin at
// (0,0) forever. Unlocking the grid only grows render extents (extra columns
// left/right, extra rows above); the render-time translation is
// `left = (x + extendLeft) * colW`, so re-locking never rewrites data.

import { snap05 } from '@muralink/ui'
import type { MuralAbsolutePlacement, MuralGridConfig } from '../../../types.ts'

/** Total columns currently visible (base + unlocked extents). */
export function visibleColumns(grid: MuralGridConfig): number {
  return grid.extendLeft + grid.columns + grid.extendRight
}

/** Render-space offset of the canonical origin, in grid units. */
export function originOffset(grid: MuralGridConfig): { col: number; row: number } {
  return { col: grid.extendLeft, row: grid.extendUp }
}

/** Pixel rect for an absolute placement inside the canvas. */
export function elementRect(
  abs: MuralAbsolutePlacement,
  grid: MuralGridConfig,
  colW: number,
): { left: number; top: number; width: number; height?: number } {
  const origin = originOffset(grid)
  return {
    left: (abs.x + origin.col) * colW,
    top: (abs.y + origin.row) * grid.rowUnit,
    width: abs.w * colW,
    height: abs.h !== undefined ? abs.h * grid.rowUnit : undefined,
  }
}

/** Clamp a position to the locked base grid: x in [0, columns - w], y >= 0. */
export function clampLocked(
  pos: { x: number; y: number },
  w: number,
  grid: MuralGridConfig,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(pos.x, grid.columns - w)),
    y: Math.max(0, pos.y),
  }
}

/**
 * Grow extents so a dropped position fits (unlocked murals only). Positions are
 * snapped before growing so a drop at x: -0.5 adds one column, not zero.
 */
export function growExtents(
  grid: MuralGridConfig,
  pos: { x: number; y: number },
  w: number,
): MuralGridConfig {
  const x = snap05(pos.x)
  const y = snap05(pos.y)
  const extendLeft = Math.max(grid.extendLeft, Math.ceil(-x))
  const extendRight = Math.max(grid.extendRight, Math.ceil(x + w - grid.columns))
  const extendUp = Math.max(grid.extendUp, Math.ceil(-y))
  if (extendLeft === grid.extendLeft && extendRight === grid.extendRight && extendUp === grid.extendUp) {
    return grid
  }
  return { ...grid, extendLeft, extendRight, extendUp }
}

// ── Markdown chunk splitting ─────────────────────────────────────────────────

export interface MarkdownBlock {
  /** Character offset of the block's first line start within the chunk. */
  from: number
  /** Character offset just past the block's last line (excl. trailing \n). */
  to: number
  text: string
}

/**
 * Split a markdown chunk into top-level blocks: runs of non-blank lines,
 * fence-aware (a ```fenced``` region is always one block even with blank
 * lines inside). Blank lines separate blocks and belong to none.
 */
export function splitBlocks(text: string): MarkdownBlock[] {
  const lines = text.split('\n')
  const blocks: MarkdownBlock[] = []
  let offset = 0
  let start: number | null = null
  let end = 0
  let inFence = false

  const flush = () => {
    if (start === null) return
    blocks.push({ from: start, to: end, text: text.slice(start, end) })
    start = null
  }

  for (const line of lines) {
    const isBlank = line.trim() === ''
    const isFenceMarker = /^(```|~~~)/.test(line.trim())
    if (isFenceMarker) {
      if (start === null) start = offset
      end = offset + line.length
      inFence = !inFence
      if (!inFence) flush()
    } else if (inFence || !isBlank) {
      if (start === null) start = offset
      end = offset + line.length
    } else {
      flush()
    }
    offset += line.length + 1
  }
  flush()
  return blocks
}

/**
 * Split a chunk's text around one block: returns the markdown before it, the
 * block itself, and the markdown after it (each trimmed of outer blank lines,
 * empties dropped by the caller).
 */
export function splitAroundBlock(
  text: string,
  block: MarkdownBlock,
): { before: string; block: string; after: string } {
  return {
    before: text.slice(0, block.from).replace(/\n+$/, ''),
    block: block.text,
    after: text.slice(block.to).replace(/^\n+/, ''),
  }
}

// ── Heading-aware outline (for "convertir a canvas") ─────────────────────────

export interface HeadingSection {
  /** 1–6. */
  level: number
  /** Heading text without the leading #'s. */
  title: string
  /** Markdown under this heading, before any sub-heading (trimmed). */
  body: string
  /** Nested sub-sections (deeper headings). */
  children: HeadingSection[]
}

/**
 * Split a markdown document into a nested outline by ATX headings (`#`..`######`),
 * fence-aware (a `#` inside a ``` block is not a heading). Text before the first
 * heading is returned as `preamble`. Deeper headings nest under shallower ones.
 */
export function splitByHeadings(text: string): { preamble: string; sections: HeadingSection[] } {
  const lines = text.split('\n')
  const root: HeadingSection = { level: 0, title: '', body: '', children: [] }
  const stack: HeadingSection[] = [root]
  let buf: string[] = []
  let inFence = false

  const flush = () => {
    stack[stack.length - 1]!.body = buf.join('\n').replace(/^\n+|\n+$/g, '')
    buf = []
  }

  for (const line of lines) {
    const t = line.trim()
    if (/^(```|~~~)/.test(t)) { inFence = !inFence; buf.push(line); continue }
    const hm = !inFence ? line.match(/^(#{1,6})\s+(.*)$/) : null
    if (hm) {
      flush()
      const level = hm[1]!.length
      const section: HeadingSection = { level, title: hm[2]!.trim(), body: '', children: [] }
      while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop()
      stack[stack.length - 1]!.children.push(section)
      stack.push(section)
    } else {
      buf.push(line)
    }
  }
  flush()
  return { preamble: root.body, sections: root.children }
}

/** Merge two markdown chunks with a blank line between them. */
export function mergeMarkdown(a: string, b: string): string {
  const left = a.replace(/\n+$/, '')
  const right = b.replace(/^\n+/, '')
  if (!left) return right
  if (!right) return left
  return `${left}\n\n${right}`
}
