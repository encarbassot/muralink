import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// A domain-free dropdown for the grid cell header ⋯ button. The caller supplies a
// flat, already-bound item list; this component knows nothing about modules. It
// portals to <body> and positions itself `fixed` so it escapes the cell's
// `overflow: hidden` clip container.

export interface CellMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  /** Items with different group keys get a separator drawn between them. */
  group?: string
  onSelect: () => void
}

interface CellMenuProps {
  items: CellMenuItem[]
  /** Viewport coordinates to pin the menu's top-right corner to. */
  anchor: { top: number; right: number }
  onClose: () => void
}

export function CellMenu({ items, anchor, onClose }: CellMenuProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      {/* Outside-click catcher — pointerdown fires before the item's click. */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
        onPointerDown={onClose}
        onClick={(e) => e.stopPropagation()}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: anchor.top,
          right: anchor.right,
          zIndex: 999,
          minWidth: 184,
          maxWidth: 260,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong, var(--border))',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          padding: 5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {items.map((item, i) => {
          const prev = items[i - 1]
          const needsSep = prev && prev.group !== item.group
          return (
            <div key={item.id}>
              {needsSep && <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />}
              <button
                disabled={item.disabled}
                onClick={() => { if (!item.disabled) { item.onSelect(); onClose() } }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'transparent',
                  color: item.disabled
                    ? 'var(--fg-faint)'
                    : item.danger
                      ? '#ef4444'
                      : 'var(--fg)',
                  cursor: item.disabled ? 'default' : 'pointer',
                  fontSize: 12,
                  textAlign: 'left',
                  lineHeight: 1.2,
                }}
                onMouseEnter={(e) => { if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {item.icon && <span style={{ fontSize: 14, flexShrink: 0, width: 16, textAlign: 'center' }}>{item.icon}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
