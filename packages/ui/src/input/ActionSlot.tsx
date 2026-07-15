import { useState } from 'react'
import type React from 'react'
import { OverflowMenu } from './OverflowMenu.tsx'
import type { FieldAction } from './types.ts'

interface ActionSlotProps {
  actions: FieldAction[]
  // Max buttons shown inline. Extras fold into a "+" overflow menu.
  max: number
  side: 'left' | 'right'
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  flex: '0 0 auto',
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: 'var(--muted-fg)',
  fontSize: 15,
  cursor: 'pointer',
}

// A cluster of round icon buttons at one edge of the bar, with overflow folding.
export function ActionSlot({ actions, max, side }: ActionSlotProps) {
  const [open, setOpen] = useState(false)

  if (actions.length === 0) return null

  // If everything fits, show all. Otherwise reserve one spot for the "+".
  const fits = actions.length <= max
  const visibleCount = fits ? actions.length : Math.max(0, max - 1)
  const visible = actions.slice(0, visibleCount)
  const overflow = actions.slice(visibleCount)

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flex: '0 0 auto',
      }}
    >
      {visible.map((action) => (
        <button
          key={action.id}
          title={action.label ?? action.id}
          disabled={action.disabled}
          onClick={action.onClick}
          style={{
            ...iconButton,
            cursor: action.disabled ? 'not-allowed' : 'pointer',
            opacity: action.disabled ? 0.5 : 1,
          }}
        >
          {action.icon}
        </button>
      ))}

      {overflow.length > 0 && (
        <button
          title="More"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{ ...iconButton, color: 'var(--fg)' }}
        >
          +
        </button>
      )}

      {open && overflow.length > 0 && (
        <OverflowMenu
          actions={overflow}
          align={side}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
