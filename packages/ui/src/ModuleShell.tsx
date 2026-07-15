import type React from 'react'

interface ModuleShellProps {
  name: string
  icon?: string
  children: React.ReactNode
  style?: React.CSSProperties
  onSettings?: () => void
}

export function ModuleShell({ name, icon, children, style, onSettings }: ModuleShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 8px)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-fg)', flex: 1 }}>
          {name}
        </span>
        {onSettings && (
          <button
            onClick={onSettings}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-fg)',
              fontSize: 13,
              padding: '0 2px',
              lineHeight: 1,
            }}
            aria-label="Module settings"
          >
            ⋯
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
