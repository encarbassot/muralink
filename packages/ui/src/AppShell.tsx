import type React from 'react'

interface AppShellProps {
  sidebar?: React.ReactNode
  children: React.ReactNode
  shellGap?: number
  style?: React.CSSProperties
}

export function AppShell({ sidebar, children, shellGap, style }: AppShellProps) {
  const gap = shellGap != null ? `${shellGap}px` : 'var(--shell-gap, 14px)'

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        padding: gap,
        gap,
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style,
      }}
    >
      {sidebar}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  )
}
