import { useEffect } from 'react'
import type React from 'react'
import type { FieldAction } from './types.ts'

interface OverflowMenuProps {
  actions: FieldAction[]
  // Which edge the menu anchors to, so it opens under the correct "+" button.
  align: 'left' | 'right'
  onClose: () => void
}

// Context menu that holds the actions that did not fit in the visible slot.
export function OverflowMenu({ actions, align, onClose }: OverflowMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const menu: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    [align]: 0,
    minWidth: 160,
    padding: 4,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius, 8px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }

  return (
    <>
      {/* transparent backdrop closes the menu on outside click */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 19 }}
      />
      <div style={menu} role="menu">
        {actions.map((action) => (
          <button
            key={action.id}
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              action.onClick?.()
              onClose()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 8px',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--fg)',
              fontSize: 13,
              textAlign: 'left',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.5 : 1,
            }}
          >
            <span style={{ display: 'inline-flex', width: 16, justifyContent: 'center' }}>
              {action.icon}
            </span>
            {action.label ?? action.id}
          </button>
        ))}
      </div>
    </>
  )
}
