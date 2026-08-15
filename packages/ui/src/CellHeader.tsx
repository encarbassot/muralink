// The header a widget puts at the top of itself: title on the left, its own
// actions on the right, and the grid's ⋯ menu after them.
//
// It exists because the grid used to float its own chrome bar over the top of
// every cell. That bar covered whatever the widget had put there — a vault
// whose header holds "Añadir" and "Bloquear" had both buttons swallowed by an
// invisible drag strip. Putting the ⋯ *in* the header instead means the two can
// never fight over the same 34 pixels.
//
// The menu arrives through context, so a widget never has to thread grid props
// through its own component tree. Rendered outside a grid — in a modal, in the
// embed surface — the context is absent and this is simply a header.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CellMenu, type CellMenuItem } from './CellMenu.js'

export interface CellChrome {
  menuItems: CellMenuItem[]
  /** Called by CellHeader on mount so the grid knows the widget drew its own
   *  header and can skip the fallback ⋯. Returns the unsubscribe. */
  registerHeader?: () => () => void
}

const CellChromeContext = createContext<CellChrome | null>(null)

export function CellChromeProvider({ value, children }: { value: CellChrome; children: ReactNode }) {
  return <CellChromeContext.Provider value={value}>{children}</CellChromeContext.Provider>
}

/** The grid chrome for the cell this component is rendered inside, if any. */
export function useCellChrome(): CellChrome | null {
  return useContext(CellChromeContext)
}

export interface CellHeaderProps {
  /** Left side. A string is styled for you; a node is rendered as given. */
  title: ReactNode
  /** The widget's own buttons. They keep their place; ⋯ goes after them. */
  actions?: ReactNode
  /** Drop the bottom rule when the content below draws its own. */
  divider?: boolean
  style?: React.CSSProperties
}

export function CellHeader({ title, actions, divider = true, style }: CellHeaderProps) {
  const chrome = useCellChrome()
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const items = chrome?.menuItems ?? []

  // Claim the cell's ⋯. Without this the grid cannot tell a widget that draws
  // its own header from one that draws none, and a widget with no header would
  // be left with no way to reach the menu at all.
  const register = chrome?.registerHeader
  useEffect(() => register?.(), [register])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: divider ? '1px solid var(--border, #d4cfc9)' : undefined,
        flexShrink: 0,
        ...style,
      }}
    >
      {typeof title === 'string'
        ? <div style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        : title}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {actions}
        {items.length > 0 && (
          <button
            // The grid listens for pointerdown to start a drag; stopping it here
            // keeps a click on the menu from being read as the start of one.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setAnchor(anchor ? null : { top: r.bottom + 4, right: Math.max(4, window.innerWidth - r.right) })
            }}
            title="Opciones del widget"
            aria-label="Opciones del widget"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: 'var(--fg-dim, #6b6560)',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              padding: '3px 6px',
            }}
          >
            ⋯
          </button>
        )}
      </div>

      {anchor && items.length > 0 && (
        <CellMenu items={items} anchor={anchor} onClose={() => setAnchor(null)} />
      )}
    </div>
  )
}
