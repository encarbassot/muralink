import { useState } from 'react'
import type { BentoSize } from '@muralink/ui'

interface AppConfig {
  icon: string
  label: string
  accent?: string
}

const APP_CONFIGS: Record<string, AppConfig> = {
  files:     { icon: '📁', label: 'Files',     accent: '#4c9fff' },
  apps:      { icon: '⊞', label: 'Apps',       accent: '#b5936a' },
  settings:  { icon: '⚙', label: 'Settings',   accent: '#6b7280' },
  orchester: { icon: '🎛', label: 'Orchester',  accent: '#10b981' },
}

interface Props {
  size: BentoSize
  instanceId?: string
  onClick?: () => void
}

export function AppLinkWidget({ size: _size, instanceId, onClick }: Props) {
  const [hovered, setHovered] = useState(false)
  const cfg = APP_CONFIGS[instanceId ?? ''] ?? { icon: '📦', label: instanceId ?? 'App' }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'pointer',
        transition: 'background 0.15s',
        background: hovered ? 'rgba(76, 159, 255, 0.06)' : 'transparent',
      }}
    >
      <div
        style={{
          fontSize: 28,
          width: 52,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 14,
          background: 'var(--bg-elevated)',
          border: `1px solid ${hovered ? (cfg.accent ?? 'var(--accent)') : 'var(--border)'}`,
          transition: 'border-color 0.15s',
        }}
      >
        {cfg.icon}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500 }}>
        {cfg.label}
      </div>
    </div>
  )
}
