// Action system atoms — square buttons, edge rows and edge panels. This is the
// context-menu reinvented: a menu of square, hoverable, focusable elements.
// The PARENT only provides slots and context; each CHILD renders its own face
// and its own label content.

import type React from 'react'

/**
 * Square size tokens, px. 's' matches every existing 32px icon button
 * (DockButton, ActionSlot); 'm'/'l' are sized so nested S buttons tile
 * perfectly inside an M/L face with the standard 4px gap:
 *   m = 32*2 + 4   l = 32*3 + 2*4
 */
export type ActionSize = 's' | 'm' | 'l'
export const ACTION_SIZE_PX: Record<ActionSize, number> = { s: 32, m: 68, l: 104 }

/** Edge of the host card a row/panel is docked to. */
export type ActionEdge = 'top' | 'bottom' | 'left' | 'right'

/**
 * Everything the parent passes down; the CHILD renders itself with it —
 * including its own label content. The parent only provides the slot.
 */
export interface ActionChildContext {
  size: ActionSize
  px: number
  /** Edge of the host card this button's row is docked to. */
  edge: ActionEdge
  hovered: boolean
  /** Host card focus state (forwarded by the row). */
  focused: boolean
  /** 0 = row level; +1 inside a flyout/label chip (nested buttons). */
  depth: number
  /** Optional prompt from the host describing the surface. */
  contextView?: string
}

/**
 * The shared flyout slot of a row — context-menu semantics: ONE open branch
 * at a time. Hovering a button `open`s its label into the slot; activating a
 * button may `pin` new content into the SAME slot (e.g. the magnifier button
 * replacing its sibling's label chip with a search bar). Pinned content
 * ignores hover-out and closes on Escape / outside click / `close()`.
 */
export interface ActionSurfaceController {
  ownerId: string | null
  pinned: boolean
  open: (ownerId: string, content: React.ReactNode, anchor: DOMRect) => void
  pin: (ownerId: string, content: React.ReactNode, anchor?: DOMRect) => void
  close: () => void
  /** Delayed close (150ms) so the pointer can cross the icon→flyout gap. */
  scheduleClose: () => void
  cancelClose: () => void
}

export interface ActionButtonProps {
  id: string
  /** Default 's'. */
  size?: ActionSize
  /** The square face. Render-prop so content responds to size/hover/edge. */
  children: React.ReactNode | ((ctx: ActionChildContext) => React.ReactNode)
  /**
   * Hover surface content, rendered into the row's shared flyout slot. May
   * itself contain ActionButtons (nesting). Plain node = simple chip.
   */
  label?: React.ReactNode | ((ctx: ActionChildContext) => React.ReactNode)
  /**
   * Click / Enter / Space. Receives the row's surface controller (null when
   * standalone) so an action can pin content into the shared slot — the
   * magnifier→search-bar flow.
   */
  onActivate?: (surface: ActionSurfaceController | null) => void
  active?: boolean
  disabled?: boolean
  contextView?: string
  title?: string
  style?: React.CSSProperties
}

export interface ActionRowProps {
  /** top/bottom → horizontal row; left/right → vertical column. */
  edge: ActionEdge
  /** Default size for children. Default 's'. */
  size?: ActionSize
  /** Host card focus state, forwarded into every child's context. */
  focused?: boolean
  contextView?: string
  /** Default 4. */
  gap?: number
  children: React.ReactNode
  style?: React.CSSProperties
}

export interface EdgePanelProps {
  edge: ActionEdge
  open: boolean
  /** Escape / outside click. */
  onClose?: () => void
  /** Px perpendicular to the edge. Default 56. */
  thickness?: number
  /**
   * 'overlay' (default): absolutely positioned inside the host's relative
   * wrapper. 'push': rendered in flow as a flex sibling.
   */
  mode?: 'overlay' | 'push'
  children: React.ReactNode
  style?: React.CSSProperties
}
