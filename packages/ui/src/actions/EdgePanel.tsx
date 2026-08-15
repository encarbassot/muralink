// A panel that emerges from a host card's edge ("panel paralelo a su arista")
// in focus mode. 'overlay' docks absolutely inside the host's relative
// wrapper; 'push' renders in flow as a flex sibling.

import { useEffect, useRef } from 'react'
import type { EdgePanelProps } from './types.ts'

export function EdgePanel({
  edge,
  open,
  onClose,
  thickness = 56,
  mode = 'overlay',
  children,
  style,
}: EdgePanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !onClose) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, onClose])

  if (!open) return null

  const horizontal = edge === 'top' || edge === 'bottom'
  const overlayPos: React.CSSProperties =
    mode === 'overlay'
      ? {
          position: 'absolute',
          [edge]: 0,
          ...(horizontal ? { left: 0, right: 0, height: thickness } : { top: 0, bottom: 0, width: thickness }),
        }
      : (horizontal ? { height: thickness } : { width: thickness })

  return (
    <div
      ref={ref}
      style={{
        ...overlayPos,
        boxSizing: 'border-box',
        background: 'var(--bg-elevated, #1b2026)',
        border: '1px solid var(--border, #262c34)',
        borderRadius: 10,
        boxShadow: 'var(--shadow, 0 6px 24px rgba(0,0,0,0.4))',
        padding: 6,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
