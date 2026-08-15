// The shared flyout slot machinery. Mechanics modeled on the shell Dock's
// flyout (portal to <body>, fixed positioning, 150ms close delay so the
// pointer can cross the icon→flyout gap) — re-implemented here because the
// dependency direction is shell→ui, never ui→shell.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActionEdge, ActionSurfaceController } from './types.ts'

export const ActionSurfaceContext = createContext<ActionSurfaceController | null>(null)

/** Row-level context an ActionButton reads to build its child context. */
export interface ActionRowInfo {
  edge: ActionEdge
  size: 's' | 'm' | 'l'
  focused: boolean
  contextView?: string
}
export const ActionRowContext = createContext<ActionRowInfo | null>(null)

/** 0 at row level; incremented by the flyout renderer for nested buttons. */
export const ActionDepthContext = createContext(0)

export function useActionSurface(): ActionSurfaceController | null {
  return useContext(ActionSurfaceContext)
}

interface SurfaceState {
  ownerId: string | null
  pinned: boolean
  content: React.ReactNode
  anchor: DOMRect | null
}

/** One controller + its rendered flyout. Used by ActionRow (shared) and by a
 *  standalone ActionButton (degenerate single-button case). */
export function useActionSurfaceController(): {
  controller: ActionSurfaceController
  state: SurfaceState
} {
  const [state, setState] = useState<SurfaceState>({ ownerId: null, pinned: false, content: null, anchor: null })
  const stateRef = useRef(state)
  stateRef.current = state
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])
  const close = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setState({ ownerId: null, pinned: false, content: null, anchor: null })
  }, [])
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      // Pinned content ignores hover-out — only Escape/outside/close() ends it.
      if (!stateRef.current.pinned) close()
    }, 150)
  }, [close])
  const open = useCallback((ownerId: string, content: React.ReactNode, anchor: DOMRect) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    // A pinned slot is not stolen by hover.
    if (stateRef.current.pinned) return
    setState({ ownerId, pinned: false, content, anchor })
  }, [])
  const pin = useCallback((ownerId: string, content: React.ReactNode, anchor?: DOMRect) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setState((prev) => ({ ownerId, pinned: true, content, anchor: anchor ?? prev.anchor }))
  }, [])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  return {
    controller: { ownerId: state.ownerId, pinned: state.pinned, open, pin, close, scheduleClose, cancelClose },
    state,
  }
}

const GAP = 6

/** Fixed-position flyout anchored to a button rect, opening TOWARD the card
 *  interior (bottom edge → above the button, left edge → to its right, …).
 *  Clamped to the viewport — narrow hosts (a 360px side panel) overflow easily. */
export function ActionFlyout({ edge, state, controller, depth }: {
  edge: ActionEdge
  state: SurfaceState
  controller: ActionSurfaceController
  depth: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Position after first paint so we can clamp with the real flyout size.
  useEffect(() => {
    const a = state.anchor
    const el = ref.current
    if (!a || !el) { setPos(null); return }
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left: number
    let top: number
    if (edge === 'bottom') { left = a.left; top = a.top - GAP - h }
    else if (edge === 'top') { left = a.left; top = a.bottom + GAP }
    else if (edge === 'left') { left = a.right + GAP; top = a.top }
    else { left = a.left - GAP - w; top = a.top }
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4))
    top = Math.max(4, Math.min(top, window.innerHeight - h - 4))
    setPos({ left, top })
  }, [state.anchor, state.content, edge])

  // Pinned: Escape / outside pointer-down closes.
  useEffect(() => {
    if (!state.pinned) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') controller.close()
    }
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) controller.close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [state.pinned, controller])

  if (!state.ownerId || !state.content) return null

  return createPortal(
    <div
      ref={ref}
      onMouseEnter={controller.cancelClose}
      onMouseLeave={controller.scheduleClose}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: 900,
        background: 'var(--bg-elevated, #1b2026)',
        border: '1px solid var(--border, #262c34)',
        borderRadius: 10,
        boxShadow: 'var(--shadow, 0 6px 24px rgba(0,0,0,0.4))',
        padding: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <ActionDepthContext.Provider value={depth + 1}>
        {state.content}
      </ActionDepthContext.Provider>
    </div>,
    document.body,
  )
}
