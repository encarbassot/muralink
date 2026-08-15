// A SQUARE action button — the atom of the reinvented context menu. The face
// content and the hover label are both the CHILD's responsibility (render-props
// receiving the full context); the parent row only provides the slot, the edge
// and the sizing. Standalone (no ActionRow) it owns a private flyout so the
// hover-label behavior is identical everywhere.

import { useContext, useRef, useState } from 'react'
import { ACTION_SIZE_PX, type ActionButtonProps, type ActionChildContext } from './types.ts'
import {
  ActionDepthContext,
  ActionFlyout,
  ActionRowContext,
  ActionSurfaceContext,
  useActionSurfaceController,
} from './ActionSurface.tsx'

function renderSlot(
  slot: React.ReactNode | ((ctx: ActionChildContext) => React.ReactNode) | undefined,
  ctx: ActionChildContext,
): React.ReactNode {
  return typeof slot === 'function' ? slot(ctx) : slot
}

export function ActionButton({
  id,
  size,
  children,
  label,
  onActivate,
  active = false,
  disabled = false,
  contextView,
  title,
  style,
}: ActionButtonProps) {
  const row = useContext(ActionRowContext)
  const sharedSurface = useContext(ActionSurfaceContext)
  const depth = useContext(ActionDepthContext)
  const [hovered, setHovered] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Standalone fallback: own controller + own flyout (degenerate 1-button row).
  const own = useActionSurfaceController()
  const surface = sharedSurface ?? own.controller

  const resolvedSize = size ?? row?.size ?? 's'
  const px = ACTION_SIZE_PX[resolvedSize]
  const ctx: ActionChildContext = {
    size: resolvedSize,
    px,
    edge: row?.edge ?? 'bottom',
    hovered,
    focused: row?.focused ?? false,
    depth,
    contextView: contextView ?? row?.contextView,
  }

  function onMouseEnter() {
    setHovered(true)
    const rect = btnRef.current?.getBoundingClientRect()
    const content = renderSlot(label, { ...ctx, hovered: true })
    if (rect && content != null) surface.open(id, content, rect)
    else surface.cancelClose()
  }
  function onMouseLeave() {
    setHovered(false)
    surface.scheduleClose()
  }

  return (
    <>
      <button
        ref={btnRef}
        title={title}
        aria-label={title ?? id}
        disabled={disabled}
        onClick={() => onActivate?.(sharedSurface ?? surface)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          width: px,
          height: px,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 10,
          cursor: disabled ? 'default' : 'pointer',
          background: active || hovered ? 'var(--muted, #1b2026)' : 'transparent',
          color: active ? 'var(--fg, #e6e9ee)' : 'var(--muted-fg, #9aa4b2)',
          transition: 'background 0.1s',
          padding: 0,
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #6366f1)' }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none' }}
      >
        {renderSlot(children, ctx)}
      </button>
      {/* Standalone flyout only — inside a row, the row renders the shared one. */}
      {!sharedSurface && (
        <ActionFlyout edge={ctx.edge} state={own.state} controller={own.controller} depth={depth} />
      )}
    </>
  )
}
