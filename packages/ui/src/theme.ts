import type React from 'react'

export interface UiTheme {
  colors: {
    primary: string
    primaryForeground: string
    background: string
    foreground: string
    muted: string
    mutedForeground: string
    border: string
    accent: string
  }
  font: {
    sans: string
    mono: string
  }
  borderRadius: string
  shell: {
    gap: number
    sidebarWidth: number
    capsuleRadius: number
  }
}

export const defaultTheme: UiTheme = {
  colors: {
    primary: '#1a1a1a',
    primaryForeground: '#ffffff',
    background: '#f9f7f4',
    foreground: '#1a1a1a',
    muted: '#e8e4df',
    mutedForeground: '#6b6560',
    border: '#d4cfc9',
    accent: '#b5936a',
  },
  font: {
    sans: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  borderRadius: '8px',
  shell: {
    gap: 14,
    sidebarWidth: 40,
    capsuleRadius: 14,
  },
}

export function themeVars(theme: UiTheme): React.CSSProperties {
  return {
    '--primary': theme.colors.primary,
    '--primary-fg': theme.colors.primaryForeground,
    '--bg': theme.colors.background,
    '--fg': theme.colors.foreground,
    '--muted': theme.colors.muted,
    '--muted-fg': theme.colors.mutedForeground,
    '--border': theme.colors.border,
    '--accent': theme.colors.accent,
    '--radius': theme.borderRadius,
    '--shell-gap': `${theme.shell.gap}px`,
    '--sidebar-width': `${theme.shell.sidebarWidth}px`,
    '--capsule-radius': `${theme.shell.capsuleRadius}px`,
    fontFamily: theme.font.sans,
    background: theme.colors.background,
    color: theme.colors.foreground,
  } as React.CSSProperties
}
