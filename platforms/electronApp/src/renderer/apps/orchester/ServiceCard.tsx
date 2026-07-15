import { useState } from 'react'
import type { ManagedService, ServiceDriver } from '@/shared/fsApi'

function serviceUrl(svc: ManagedService): string | null {
  if (!svc.port) return null
  if (svc.domain) {
    const port = (svc.port === 80 || svc.port === 443) ? '' : `:${svc.port}`
    return `http://${svc.domain}${port}`
  }
  return `http://localhost:${svc.port}`
}

const STATUS_COLOR: Record<string, string> = {
  running:  '#4ade80',
  starting: '#facc15',
  stopped:  '#6b7280',
  error:    '#f87171',
}

const DRIVER_ICON: Record<ServiceDriver, string> = {
  docker:          '🐳',
  pm2:             '⚙',
  process:         '⚙',
  embedded:        '⬡',
  'web-frontend':  '🌐',
  share:           '📁',
}

interface Props {
  service: ManagedService
  busy: boolean
  onToggle: () => void
  onRestart: () => void
  onConfigure?: () => void
  onDelete?: () => void
}

export function ServiceCard({ service: svc, busy, onToggle, onRestart, onConfigure, onDelete }: Props) {
  const [hovered, setHovered] = useState(false)
  const isActive = svc.status === 'running' || svc.status === 'starting'
  const isRunning = svc.status === 'running'
  const dot = STATUS_COLOR[svc.status] ?? '#6b7280'
  const driverIcon = DRIVER_ICON[svc.driver] ?? '⚙'
  const url = isRunning ? serviceUrl(svc) : null

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg)',
        border: `1px solid ${svc.status === 'error' ? '#ef444433' : 'var(--border)'}`,
        transition: 'background 0.12s',
      }}
    >
      {/* Driver icon */}
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{driverIcon}</span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Status dot */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dot,
              boxShadow: isActive ? `0 0 5px ${dot}` : 'none',
              flexShrink: 0,
              transition: 'background 0.3s, box-shadow 0.3s',
              animation: svc.status === 'starting' ? 'dock-tick 1s ease-in-out infinite' : 'none',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            {svc.label}
          </span>
          {svc.driver === 'docker' && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(14,165,233,0.15)',
                color: '#0ea5e9',
                border: '1px solid rgba(14,165,233,0.3)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              docker
            </span>
          )}
          {svc.driver === 'pm2' && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(168,85,247,0.15)',
                color: '#a855f7',
                border: '1px solid rgba(168,85,247,0.3)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              pm2
            </span>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {svc.description && <span>{svc.description}</span>}
          {svc.port && (
            <span style={{ color: 'var(--fg-dim)' }}>:{svc.port}</span>
          )}
          {svc.domain && (
            <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{svc.domain}</span>
          )}
          {svc.path && (
            <span
              style={{
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--fg-faint)',
                fontFamily: 'monospace',
                fontSize: 10,
              }}
              title={svc.path}
            >
              {svc.path}
            </span>
          )}
        </div>

        {/* Clickable URL when running */}
        {url && (
          <button
            onClick={() => void window.shellApi.openExternal(url)}
            style={{
              marginTop: 3,
              padding: '2px 7px',
              borderRadius: 5,
              border: '1px solid var(--accent, #4c9fff)44',
              background: 'rgba(76,159,255,0.08)',
              color: 'var(--accent, #4c9fff)',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              textDecoration: 'none',
              letterSpacing: '0.01em',
            }}
          >
            ↗ {url}
          </button>
        )}

        {/* Warn when a path-dependent service has no path configured */}
        {svc.configurable && (svc.driver === 'web-frontend' || svc.driver === 'share') && !svc.path && !svc.error && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 3,
              fontSize: 10,
              color: '#f59e0b',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            ⚠ No directory configured — click ⚙ to set a path
          </div>
        )}
        {svc.error && (
          <div style={{ fontSize: 10, color: '#f87171', marginTop: 2, fontFamily: 'monospace' }}>
            {svc.error}
          </div>
        )}
      </div>

      {/* PID badge */}
      {svc.pid && isActive && (
        <span style={{ fontSize: 9, color: 'var(--fg-faint)', fontFamily: 'monospace' }}>
          pid {svc.pid}
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {/* Configure gear */}
        {onConfigure && (
          <IconButton onClick={onConfigure} title="Configure" disabled={busy}>
            ⚙
          </IconButton>
        )}

        {/* Restart — only when running */}
        {isActive && (
          <IconButton onClick={onRestart} title="Restart" disabled={busy}>
            ↺
          </IconButton>
        )}

        {/* Delete — only for user-created shares */}
        {onDelete && (
          <IconButton onClick={onDelete} title="Remove share" disabled={busy} danger>
            ✕
          </IconButton>
        )}

        {/* Play / Stop — disabled when path-dependent service has no path */}
        <PlayStopButton
          isActive={isActive}
          busy={busy}
          disabled={!isActive && (svc.driver === 'web-frontend' || svc.driver === 'share') && !svc.path}
          onToggle={onToggle}
        />
      </div>
    </div>
  )
}

function PlayStopButton({
  isActive,
  busy,
  disabled,
  onToggle,
}: {
  isActive: boolean
  busy: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy || disabled}
      title={isActive ? 'Stop' : disabled ? 'Configure a directory first' : 'Start'}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: `1px solid ${isActive ? '#ef444455' : disabled ? 'var(--border)' : 'var(--accent, #4c9fff)55'}`,
        background: isActive ? 'rgba(239,68,68,0.1)' : disabled ? 'transparent' : 'rgba(76,159,255,0.1)',
        color: isActive ? '#f87171' : disabled ? 'var(--fg-faint)' : 'var(--accent, #4c9fff)',
        cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        opacity: busy ? 0.5 : 1,
        transition: 'opacity 0.15s',
        flexShrink: 0,
      }}
    >
      {busy ? '…' : isActive ? '■' : '▶'}
    </button>
  )
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: `1px solid ${danger ? '#ef444433' : 'var(--border)'}`,
        background: danger ? 'rgba(239,68,68,0.08)' : 'var(--bg)',
        color: danger ? '#f87171' : 'var(--fg-dim)',
        cursor: disabled ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
