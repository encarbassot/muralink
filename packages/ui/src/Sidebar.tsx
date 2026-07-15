import { useState } from 'react'
import type React from 'react'

export interface SidebarItem {
  id: string
  icon: React.ReactNode
  label?: string
  onClick?: () => void
  active?: boolean
}

interface SidebarProps {
  items: SidebarItem[]
  footer?: React.ReactNode
  width?: number
}

export function Sidebar({ items, footer, width }: SidebarProps) {
  return (
    <div
      style={{
        width: width ?? 'var(--sidebar-width, 40px)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 4,
        paddingBottom: 4,
        background: 'transparent',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {items.map((item) => (
          <SidebarButton key={item.id} item={item} />
        ))}
      </div>
      {footer && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {footer}
        </div>
      )}
    </div>
  )
}

function SidebarButton({ item }: { item: SidebarItem }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      title={item.label}
      onClick={item.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: item.active
          ? 'var(--muted, #e8e4df)'
          : hovered
            ? 'var(--muted, #e8e4df)'
            : 'transparent',
        color: item.active ? 'var(--fg, #1a1a1a)' : 'var(--muted-fg, #6b6560)',
        transition: 'background 0.1s',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {item.icon}
    </button>
  )
}
