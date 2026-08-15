// One module in the instance stack: a bordered card with a header row (title
// area + "…" overflow menu) and a body. The menu holds the module's actions
// (rename, colour, share, delete…) so the stack stays visually uniform whether
// it lives in a bottom sheet or a VSCode-style side panel.

import { useState } from 'react'
import type React from 'react'

export interface ModuleCardAction {
  label: string
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
}

export interface ModuleCardProps {
  /** Title area: an input, a label, anything. */
  header: React.ReactNode
  /** Items in the "…" menu. */
  actions?: ModuleCardAction[]
  /** Custom rows (colour dots, emoji row…) rendered above the actions. */
  menuExtra?: React.ReactNode
  children?: React.ReactNode
}

export function ModuleCard({ header, actions = [], menuExtra, children }: ModuleCardProps) {
  const [open, setOpen] = useState(false)
  const hasMenu = actions.length > 0 || !!menuExtra
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
        background: 'var(--bg-elevated, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        {hasMenu && (
          <button
            onClick={() => setOpen((v) => !v)}
            title="Opciones"
            style={{ border: 'none', background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}
          >
            …
          </button>
        )}
      </div>

      {open && (
        <>
          {/* invisible backdrop: any outside tap closes the menu */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
          <div
            style={{
              position: 'absolute',
              top: 34,
              right: 8,
              zIndex: 501,
              background: 'var(--bg-elevated, #fff)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 180,
            }}
          >
            {menuExtra}
            {actions.map((a) => (
              <button
                key={a.label}
                disabled={a.disabled}
                onClick={() => { setOpen(false); a.onSelect?.() }}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  cursor: a.disabled ? 'default' : 'pointer',
                  fontSize: 13,
                  padding: '6px 8px',
                  borderRadius: 6,
                  color: a.danger ? 'var(--danger, #e5484d)' : 'var(--fg)',
                  opacity: a.disabled ? 0.5 : 1,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      {children}
    </div>
  )
}
