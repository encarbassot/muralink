// A row (top/bottom) or column (left/right) of ActionButtons docked to an edge
// of a host card. Provides the shared flyout slot — one open branch at a time,
// context-menu semantics — and forwards edge/size/focus context to children.

import { useContext } from 'react'
import type { ActionRowProps } from './types.ts'
import {
  ActionDepthContext,
  ActionFlyout,
  ActionRowContext,
  ActionSurfaceContext,
  useActionSurfaceController,
} from './ActionSurface.tsx'

export function ActionRow({
  edge,
  size = 's',
  focused = false,
  contextView,
  gap = 4,
  children,
  style,
}: ActionRowProps) {
  const { controller, state } = useActionSurfaceController()
  const depth = useContext(ActionDepthContext)
  const horizontal = edge === 'top' || edge === 'bottom'

  return (
    <ActionRowContext.Provider value={{ edge, size, focused, contextView }}>
      <ActionSurfaceContext.Provider value={controller}>
        <div
          role="toolbar"
          aria-orientation={horizontal ? 'horizontal' : 'vertical'}
          style={{
            display: 'flex',
            flexDirection: horizontal ? 'row' : 'column',
            alignItems: 'center',
            gap,
            padding: 4,
            ...style,
          }}
        >
          {children}
        </div>
        <ActionFlyout edge={edge} state={state} controller={controller} depth={depth} />
      </ActionSurfaceContext.Provider>
    </ActionRowContext.Provider>
  )
}
