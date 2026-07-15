/**
 * PinnedDock — bottom bar with multi-level timed pins.
 *
 * Level 1: timed — pie ring counts down; stopwatch pulses when < 10% left.
 * Level 2: permanent — solid anchor icon.
 *
 * Sort: permanent (L2) left → timed sorted by most-remaining left → expiring right.
 * Drag: drop on L2 zone = promote; drop on L1 zone = demote; drag off right = unpin.
 * Hover: shows "Xd Xh left" tooltip and a reset-timer button.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  usePinned,
  sortedPins,
  msRemaining,
  lifetimeFraction,
  formatRemaining,
  type PinnedItem,
  type PinLevel,
} from '@/stores/pinnedStore'
import { usePlatform } from '@/stores/platformStore'
import { useNavigation } from '@/stores/navigationStore'
import { useExplorer } from '@/stores/explorerStore'
import { useLayoutStore } from '@/stores/layoutStore'

// ── Pie ring countdown ────────────────────────────────────────────────────────

function PieRing({ fraction }: { fraction: number }) {
  const r = 5.5
  const cx = 8
  const cy = 8
  const circumference = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, fraction)) * circumference

  const color =
    fraction > 0.6 ? 'var(--accent)' : fraction > 0.25 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={16} height={16} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={2.5}
      />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  )
}

// ── Stopwatch icon (pulses when expiring) ─────────────────────────────────────

function StopwatchIcon({ urgent }: { urgent: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        lineHeight: 1,
        display: 'inline-block',
        animation: urgent ? 'dock-tick 1s ease-in-out infinite' : 'none',
      }}
    >
      ⏱
    </span>
  )
}

// ── Individual pin chip ───────────────────────────────────────────────────────

interface PinChipProps {
  item: PinnedItem
  levels: PinLevel[]
  maxLevel: number
  isDragging: boolean
  isDropTarget: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onClick: (item: PinnedItem) => void
}

function PinChip({
  item,
  levels,
  maxLevel,
  isDragging,
  isDropTarget,
  onPointerDown,
  onClick,
}: PinChipProps) {
  const [hovered, setHovered] = useState(false)
  const unpinItem = usePinned((s) => s.unpinItem)
  const resetItemTimer = usePinned((s) => s.resetItemTimer)
  const setItemLevel = usePinned((s) => s.setItemLevel)

  const isPermanent = item.level >= maxLevel
  const fraction = lifetimeFraction(item, levels)
  const ms = msRemaining(item, levels)
  const urgent = !isPermanent && fraction < 0.1

  const minLevel = Math.min(...levels.map((l) => l.level))
  const canPromote = item.level < maxLevel
  const canDemote = item.level > minLevel

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => onPointerDown(e, item.id)}
      onClick={() => onClick(item)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px 2px 5px',
        borderRadius: 6,
        background: isDropTarget
          ? 'var(--accent-dim)'
          : isDragging
            ? 'var(--bg-panel)'
            : 'var(--bg-elevated)',
        border: `1px solid ${isDropTarget ? 'var(--accent)' : 'var(--border)'}`,
        color: 'var(--fg-dim)',
        fontSize: 11,
        whiteSpace: 'nowrap',
        cursor: 'grab',
        userSelect: 'none',
        flexShrink: 0,
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s, background 0.15s, border-color 0.15s',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 10 }}>{item.icon}</span>

      {/* Label */}
      <span>{item.label}</span>

      {/* Permanent anchor OR timed pie ring */}
      {isPermanent ? (
        <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 1 }}>⚓</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 1 }}>
          <StopwatchIcon urgent={urgent} />
          <PieRing fraction={fraction} />
        </div>
      )}

      {/* Hover overlay: actions + tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            background: 'rgba(17, 20, 24, 0.95)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '6px 8px',
            fontSize: 11,
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
            zIndex: 200,
            boxShadow: 'var(--shadow)',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            minWidth: 130,
          }}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Time remaining */}
          <div style={{ color: 'var(--fg-dim)', fontSize: 10, textAlign: 'center' }}>
            {isPermanent ? 'Pinned permanently' : ms != null ? formatRemaining(ms) : ''}
          </div>

          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {/* Reset timer */}
            {!isPermanent && (
              <ActionButton
                onClick={() => resetItemTimer(item.id)}
                title="Reset timer"
              >
                ↺
              </ActionButton>
            )}
            {/* Promote */}
            {canPromote && (
              <ActionButton
                onClick={() => setItemLevel(item.id, item.level + 1)}
                title="Pin permanently"
              >
                ⚓
              </ActionButton>
            )}
            {/* Demote */}
            {canDemote && (
              <ActionButton
                onClick={() => setItemLevel(item.id, item.level - 1)}
                title="Back to timed"
              >
                ⏱
              </ActionButton>
            )}
            {/* Unpin */}
            <ActionButton
              onClick={() => unpinItem(item.id)}
              title="Unpin"
              danger
            >
              ×
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: danger ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)',
        border: `1px solid ${danger ? '#ef4444' : 'var(--border)'}`,
        borderRadius: 5,
        color: danger ? '#ef4444' : 'var(--fg-dim)',
        fontSize: 13,
        width: 26,
        height: 22,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Main dock ─────────────────────────────────────────────────────────────────

export function PinnedDock() {
  const items = usePinned((s) => s.items)
  const levels = usePinned((s) => s.levels)
  const setItemLevel = usePinned((s) => s.setItemLevel)
  const unpinItem = usePinned((s) => s.unpinItem)

  const activeAppId = usePlatform((s) => s.activeAppId)
  const toggleAppsDrawer = usePlatform((s) => s.toggleAppsDrawer)
  const openApp = usePlatform((s) => s.openApp)

  const consoleOpen = useExplorer((s) => s.consoleOpen)
  const toggleConsole = useExplorer((s) => s.toggleConsole)

  const reset = useNavigation((s) => s.reset)
  const installedApps = usePlatform((s) => s.installedApps)
  const navigateTo = useLayoutStore((s) => s.navigateTo)
  const navigateToRoot = useLayoutStore((s) => s.navigateToRoot)

  // Ticker to re-render every minute (updates pie ring fractions)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const maxLevel = Math.max(...levels.map((l) => l.level))
  const sorted = sortedPins(items, levels)

  // ── Drag state ──────────────────────────────────────────────────────────────

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const dragStartX = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStartX.current = e.clientX
    setDraggingId(id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  useEffect(() => {
    if (!draggingId) return

    function onMove(e: PointerEvent) {
      // Find element under pointer (excluding the dragging chip)
      const els = containerRef.current?.querySelectorAll('[data-pin-id]')
      if (!els) return
      let found: string | null = null
      for (const el of els) {
        if ((el as HTMLElement).dataset.pinId === draggingId) continue
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          found = (el as HTMLElement).dataset.pinId ?? null
          break
        }
      }
      setDropTargetId(found)
    }

    function onUp(e: PointerEvent) {
      if (dropTargetId && draggingId) {
        const dragItem = items.find((i) => i.id === draggingId)
        const targetItem = items.find((i) => i.id === dropTargetId)
        if (dragItem && targetItem) {
          // Promote: dropped on a higher-level item → match its level
          // Demote: dropped on a lower-level item → match its level
          if (dragItem.level !== targetItem.level) {
            setItemLevel(draggingId, targetItem.level)
          }
        }
      }

      // Drag far right off the bar → unpin
      if (draggingId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        if (e.clientX > rect.right + 60) {
          unpinItem(draggingId)
        }
      }

      setDraggingId(null)
      setDropTargetId(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draggingId, dropTargetId, items, setItemLevel, unpinItem])

  // ── Navigate to pinned item ─────────────────────────────────────────────────

  function handlePinnedClick(item: PinnedItem) {
    if (draggingId) return

    if (item.type === 'layout') {
      // Open dashboard first, then navigate into the layout
      openApp('dashboard')
      const ROOT = 'electron-dashboard'
      if (item.path === ROOT) {
        navigateToRoot()
      } else {
        navigateToRoot()
        navigateTo(item.path)
      }
      return
    }

    // Default: file path navigation
    if (activeAppId !== 'files') openApp('files')
    const filesApp = installedApps.find((a) => a.id === 'files')
    if (filesApp) {
      reset(filesApp.rootNode)
      useNavigation.getState().pushNode({
        id: item.path,
        label: item.label,
        icon: item.icon,
        appId: 'files',
        parentId: null,
      })
    }
  }

  return (
    <>
      {/* Tick animation keyframe (injected once via style tag) */}
      <style>{`
        @keyframes dock-tick {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-12deg); }
          75% { transform: rotate(12deg); }
        }
      `}</style>

      <div
        ref={containerRef}
        className="flex shrink-0 items-center gap-1.5 border-t px-2"
        style={{
          height: 34,
          background: 'var(--bg-bar)',
          borderColor: 'var(--border)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          position: 'relative',
        }}
      >
        {/* Apps drawer toggle */}
        <button
          onClick={toggleAppsDrawer}
          title="Apps"
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-opacity hover:opacity-80"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--fg-dim)',
            whiteSpace: 'nowrap',
          }}
        >
          ⊞
        </button>

        {/* Separator between permanent and timed (visual hint for drag zones) */}
        {sorted.some((i) => i.level >= maxLevel) && sorted.some((i) => i.level < maxLevel) && (
          <div
            style={{
              width: 1,
              height: 18,
              background: 'var(--border-strong)',
              flexShrink: 0,
              borderRadius: 1,
            }}
          />
        )}

        {/* Pin chips */}
        {sorted.map((item) => (
          <div key={item.id} data-pin-id={item.id}>
            <PinChip
              item={item}
              levels={levels}
              maxLevel={maxLevel}
              isDragging={draggingId === item.id}
              isDropTarget={dropTargetId === item.id}
              onPointerDown={onPointerDown}
              onClick={handlePinnedClick}
            />
          </div>
        ))}

        <span className="flex-1" />

        {/* Terminal toggle */}
        <button
          onClick={toggleConsole}
          title={consoleOpen ? 'Close terminal' : 'Open terminal'}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-blue-500/20"
          style={{
            background: consoleOpen ? 'var(--accent)' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: consoleOpen ? 'var(--fg)' : 'var(--fg-dim)',
            whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          &gt;_
        </button>
      </div>
    </>
  )
}
