import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DockItem } from './types.js'

interface DockProps {
  items: DockItem[]
  width?: number
}

export function Dock({ items, width }: DockProps) {
  const top = items.filter((i) => !i.bottom)
  const bottom = items.filter((i) => i.bottom)
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
      {top.map((item) => (
        <DockEntry key={item.id} item={item} />
      ))}
      {bottom.length > 0 && <div style={{ flex: 1 }} />}
      {bottom.map((item) => (
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

// Hovering the button reveals its label as a flyout chip; hovering the chip
// itself expands the extra options (item.menu), Arc/macOS-dock style. The
// flyout PORTALS to <body> with fixed positioning — the dock scrolls
// (overflow-y: auto), which would clip any absolutely-positioned child. A
// short close delay lets the pointer cross the gap between icon and flyout.
function DockButton({
  item,
}: {
  item: Extract<DockItem, { type: 'button' }>
}) {
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openFrom = (e: React.MouseEvent) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAnchor({ top: rect.top, left: rect.right + 6 })
    setHovered(true)
  }
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setHovered(false)
      setExpanded(false)
    }, 150)
  }
  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovered(false)
    setExpanded(false)
  }

  return (
    <>
      <button
        onClick={item.onClick}
        onMouseEnter={openFrom}
        onMouseLeave={scheduleClose}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          background: item.active || hovered ? 'var(--muted, #1b2026)' : 'transparent',
          color: item.active ? 'var(--fg, #e6e9ee)' : 'var(--muted-fg, #9aa4b2)',
          transition: 'background 0.1s',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {item.icon}
      </button>

      {hovered && item.label && anchor && createPortal(
        <div
          onMouseEnter={() => { cancelClose(); setExpanded(true) }}
          onMouseLeave={scheduleClose}
          style={{
            position: 'fixed',
            top: anchor.top,
            left: anchor.left,
            zIndex: 900,
            minWidth: expanded && item.menu?.length ? 172 : undefined,
            background: 'var(--bg-elevated, #1b2026)',
            border: '1px solid var(--border, #262c34)',
            borderRadius: 10,
            boxShadow: 'var(--shadow, 0 6px 24px rgba(0,0,0,0.4))',
            padding: expanded && item.menu?.length ? 6 : '5px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--fg, #e6e9ee)',
              padding: expanded && item.menu?.length ? '3px 6px 5px' : 0,
              cursor: 'pointer',
            }}
            onClick={() => { item.onClick(); closeNow() }}
          >
            {item.label}
          </div>
          {expanded && item.menu?.map((m) => (
            <button
              key={m.id}
              onClick={() => { m.onClick(); closeNow() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 6px',
                border: 'none',
                borderRadius: 7,
                background: 'transparent',
                color: 'var(--muted-fg, #9aa4b2)',
                cursor: 'pointer',
                fontSize: 12,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted, #262c34)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg, #e6e9ee)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-fg, #9aa4b2)' }}
            >
              {m.icon && <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>}
              <span>{m.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
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
