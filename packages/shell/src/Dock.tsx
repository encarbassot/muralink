import { useState } from 'react'
import type { DockItem } from './types.js'

interface DockProps {
  items: DockItem[]
  width?: number
}

export function Dock({ items, width }: DockProps) {
  return (
    <div
      style={{
        width: width ?? 'var(--dock-width, 48px)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 8,
        paddingBottom: 8,
        background: 'transparent',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {items.map((item) => (
        <DockEntry key={item.id} item={item} />
      ))}
    </div>
  )
}

function DockEntry({ item }: { item: DockItem }) {
  if (item.type === 'button') return <DockButton item={item} />
  if (item.type === 'widget') return <DockWidget item={item} />
  if (item.type === 'slot') return <DockSlot item={item} />
  return null
}

function DockButton({
  item,
}: {
  item: Extract<DockItem, { type: 'button' }>
}) {
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
          ? 'var(--muted, #1b2026)'
          : hovered
            ? 'var(--muted, #1b2026)'
            : 'transparent',
        color: item.active ? 'var(--fg, #e6e9ee)' : 'var(--muted-fg, #9aa4b2)',
        transition: 'background 0.1s',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {item.icon}
    </button>
  )
}

function DockWidget({
  item,
}: {
  item: Extract<DockItem, { type: 'widget' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const Component = item.component

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        title={item.label}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          cursor: 'pointer',
          background: expanded ? 'var(--muted, #1b2026)' : 'transparent',
          color: 'var(--muted-fg, #9aa4b2)',
          transition: 'background 0.1s',
          overflow: 'hidden',
        }}
      >
        <Component compact={!expanded} />
      </div>
      {expanded && (
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 0,
            zIndex: 500,
            minWidth: 200,
            background: 'var(--bg-elevated, #1b2026)',
            border: '1px solid var(--border, #262c34)',
            borderRadius: 10,
            boxShadow: 'var(--shadow, 0 6px 24px rgba(0,0,0,0.4))',
            padding: 8,
          }}
        >
          <Component compact={false} />
        </div>
      )}
    </div>
  )
}

function DockSlot({ item }: { item: Extract<DockItem, { type: 'slot' }> }) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {item.content}
    </div>
  )
}
