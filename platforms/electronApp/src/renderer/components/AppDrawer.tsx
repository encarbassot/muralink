/**
 * AppDrawer — glass modal overlay on top of whatever app is active.
 * The dashboard (or any other app) remains visible behind blurred glass.
 * Press Escape or click the backdrop to close.
 */

import { useEffect, useMemo } from 'react'
import { usePlatform } from '@/stores/platformStore'
import { createDrawerProvider } from '@/apps/drawer'
import type { GridItem } from '@/types/navigation'
import { registerCellRenderer } from './GridItemCell'
import { useState } from 'react'

function AppIconCell({
  item,
  zoom,
  onClick,
}: {
  item: GridItem
  zoom: number
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 transition-all"
      style={{
        cursor: 'pointer',
        background: hovered ? 'rgba(76, 159, 255, 0.12)' : 'transparent',
        border: `1px solid ${hovered ? 'rgba(76, 159, 255, 0.25)' : 'transparent'}`,
        transform: hovered ? 'scale(1.04)' : 'scale(1)',
        transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: 64 + zoom * 12,
          height: 64 + zoom * 12,
          background: 'rgba(27, 32, 38, 0.8)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 28 + zoom * 4,
          boxShadow: hovered ? '0 4px 20px rgba(76,159,255,0.2)' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        {item.icon ?? '📦'}
      </div>
      <div
        className="text-center font-medium"
        style={{ color: 'var(--fg)', fontSize: 12 + zoom }}
      >
        {item.label}
      </div>
    </div>
  )
}

let registered = false

export function AppDrawer() {
  const installedApps = usePlatform((s) => s.installedApps)
  const openApp = usePlatform((s) => s.openApp)
  const appsDrawerOpen = usePlatform((s) => s.appsDrawerOpen)
  const closeAppsDrawer = usePlatform((s) => s.closeAppsDrawer)

  const [items, setItems] = useState<GridItem[]>([])

  if (!registered) {
    registerCellRenderer('app', AppIconCell as never)
    registered = true
  }

  const provider = useMemo(() => createDrawerProvider(installedApps), [installedApps])

  useEffect(() => {
    provider.getChildren('drawer').then(setItems)
  }, [provider])

  // Escape to close
  useEffect(() => {
    if (!appsDrawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAppsDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [appsDrawerOpen, closeAppsDrawer])

  if (!appsDrawerOpen) return null

  return (
    /* Backdrop — blurs what's behind, click outside to close */
    <div
      onClick={closeAppsDrawer}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'rgba(11, 13, 16, 0.55)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Modal card — stop click propagation so clicking inside doesn't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(20, 24, 29, 0.75)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          padding: '28px 32px 32px',
          maxWidth: 560,
          width: '90%',
          maxHeight: '70vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={closeAppsDrawer}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--fg-dim)',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div
          style={{ color: 'var(--fg-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}
        >
          Apps
        </div>

        {/* App grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 8,
          }}
        >
          {items.map((item) => (
            <AppIconCell
              key={item.id}
              item={item}
              zoom={1}
              onClick={() => openApp(item.id)}
            />
          ))}
        </div>

        {items.length === 0 && (
          <div style={{ color: 'var(--fg-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No apps installed
          </div>
        )}
      </div>
    </div>
  )
}
