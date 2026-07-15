import { useEffect, useRef, useCallback } from 'react'
import { Dock } from '@muralink/shell'
import { usePlatform } from '@/stores/platformStore'
import { useDock } from '@/stores/dockStore'
import { useNavigation } from '@/stores/navigationStore'
import { useExplorer } from '@/stores/explorerStore'
import { AppShell } from '@/components/AppShell'
import { AppDrawer } from '@/components/AppDrawer'
import { PinnedDock } from '@/components/PinnedDock'
import { VisualizationSelector } from '@/components/VisualizationSelector'
import { TerminalPanel } from '@/components/TerminalPanel'
import { FilesApp, initFilesApp } from '@/apps/files'
import { CalculatorApp } from '@/apps/calculator'
import { DashboardAppDescriptor } from '@/apps/dashboard'
import { OrchesterAppDescriptor } from '@/apps/orchester'

// Layout constants — tweak here to adjust spacing globally
const SIDEBAR_W = 80   // px: left gutter (covers macOS traffic lights)
const CARD_INSET = 8   // px: card offset from window edges (top/right/bottom)
const CARD_RADIUS = 12 // px: main card border-radius

function DashboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="6" height="6" rx="1.5" />
      <rect x="8" y="0" width="6" height="6" rx="1.5" />
      <rect x="0" y="8" width="6" height="6" rx="1.5" />
      <rect x="8" y="8" width="6" height="6" rx="1.5" />
    </svg>
  )
}

export function App() {
  const registerApp = usePlatform((s) => s.registerApp)
  const activeAppId = usePlatform((s) => s.activeAppId)
  const openApp = usePlatform((s) => s.openApp)

  const dockItems = useDock((s) => s.items)

  const stack = useNavigation((s) => s.stack)
  const popToIndex = useNavigation((s) => s.popToIndex)
  const pathViewMode = useNavigation((s) => s.pathViewMode)
  const togglePathViewMode = useNavigation((s) => s.togglePathViewMode)

  const error = useExplorer((s) => s.error)
  const setError = useExplorer((s) => s.setError)
  const consoleOpen = useExplorer((s) => s.consoleOpen)
  const consoleHeight = useExplorer((s) => s.consoleHeight)
  const setConsoleHeight = useExplorer((s) => s.setConsoleHeight)

  useEffect(() => {
    registerApp(DashboardAppDescriptor)
    registerApp(CalculatorApp)
    registerApp(OrchesterAppDescriptor)
    if (!usePlatform.getState().activeAppId) {
      usePlatform.getState().openApp('dashboard')
    }
    void initFilesApp().then(() => {
      registerApp(FilesApp)
    })
  }, [registerApp])

  // Terminal resize drag
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = consoleHeight

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setConsoleHeight(startH.current + (startY.current - ev.clientY))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [consoleHeight, setConsoleHeight])

  return (
    <div
      style={{
        height: '100%',
        position: 'relative',
        background: 'var(--bg-window)',
        // entire window background is draggable (gutter areas act as title bar)
        WebkitAppRegion: 'drag',
        overflow: 'hidden',
      } as React.CSSProperties}
    >

      {/* ── Layer 0: navbar — full-window background layer ──────────────── */}
      {/* Visible in the top gutter and left gutter around the main card.   */}
      <div
        style={{
          position: 'absolute',
          left: SIDEBAR_W,
          top: 0,
          right: 0,
          height: 'var(--topbar-h)',
          zIndex: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingRight: 12,
        }}
      >
        {/* Dashboard home icon */}
        <button
          onClick={() => openApp('dashboard')}
          title="Dashboard"
          style={{
            WebkitAppRegion: 'no-drag',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 22,
            borderRadius: 6,
            background: activeAppId === 'dashboard' ? 'var(--accent-dim)' : 'transparent',
            border: `1px solid ${activeAppId === 'dashboard' ? 'var(--accent)' : 'transparent'}`,
            cursor: 'pointer',
            color: activeAppId === 'dashboard' ? 'var(--accent)' : 'var(--fg-faint)',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          } as React.CSSProperties}
        >
          <DashboardIcon />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />

        {/* Path breadcrumb */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={togglePathViewMode}
        >
          {activeAppId ? (
            pathViewMode === 'text' ? (
              <span className="truncate text-[12px]" style={{ color: 'var(--fg-dim)' }}>
                {stack.map((n) => n.label).join(' / ')}
              </span>
            ) : (
              <div
                className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                {stack.map((node, i) => (
                  <div key={node.id} className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); popToIndex(i) }}
                      className="rounded-full px-2 py-0.5 text-[11px] transition-colors hover:bg-blue-500/20"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--fg-dim)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.icon && <span className="mr-1">{node.icon}</span>}
                      {node.label}
                    </button>
                    {i < stack.length - 1 && (
                      <span style={{ color: 'var(--fg-faint)', fontSize: 10 }}>/</span>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <span className="text-[12px]" style={{ color: 'var(--fg-dim)' }}>Apps</span>
          )}
        </div>

        {/* Right controls */}
        <div
          style={{ flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          {activeAppId && <VisualizationSelector />}
        </div>
      </div>

      {/* ── Layer 1: sidebar — left gutter, outside the main card ─────────── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: SIDEBAR_W,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // push icons below the traffic lights + navbar area
          paddingTop: 'calc(var(--topbar-h) + 8px)',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <Dock items={dockItems} width={SIDEBAR_W} />
      </div>

      {/* ── Layer 2: main card ──────────────────────────────────────────────── */}
      {/* overflow:hidden + border-radius clips content to the card shape.      */}
      {/* Modals using position:fixed will escape this boundary (Electron has   */}
      {/* no transform on ancestors so fixed positions relative to viewport).   */}
      <div
        style={{
          position: 'absolute',
          top: CARD_INSET,
          right: CARD_INSET,
          bottom: CARD_INSET,
          left: SIDEBAR_W,
          zIndex: 2,
          borderRadius: CARD_RADIUS,
          overflow: 'hidden',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {/* App content — fills available space */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <AppShell />
          {/* AppDrawer: glass overlay inside the card (position:absolute) */}
          <AppDrawer />
        </div>

        {/* Terminal panel with resize handle */}
        {consoleOpen && (
          <>
            <div
              onMouseDown={onResizeMouseDown}
              style={{
                height: 6,
                cursor: 'row-resize',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 32, height: 3, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            <div style={{ height: consoleHeight, flexShrink: 0 }}>
              <TerminalPanel />
            </div>
          </>
        )}

        {/* Pinned dock at card bottom */}
        <PinnedDock />
      </div>

      {/* Error toast — fixed over everything */}
      {error && (
        <button
          onClick={() => setError(null)}
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--sync-external-blocked, #d2554e)',
            color: 'var(--fg)',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: 'var(--shadow)',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          {error} — dismiss
        </button>
      )}
    </div>
  )
}
