// Minimal right-click menu. Native context menu is suppressed app-wide; this
// replaces it. Renders a fixed panel + a full-screen catcher that closes on any
// outside click.

import { useEffect } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="fixed min-w-[180px] rounded-md border py-1 shadow-lg"
        style={{
          left: x,
          top: y,
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return
              it.onClick()
              onClose()
            }}
            className="block w-full px-3 py-1 text-left text-[12px] disabled:opacity-40"
            style={{ color: it.danger ? 'var(--sync-external-blocked, #d2554e)' : 'var(--fg)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-dim)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
