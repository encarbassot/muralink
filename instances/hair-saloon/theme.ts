export interface InstanceTheme {
  name: string
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
}

const theme: InstanceTheme = {
  name: 'hardsalon',
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
}

export default theme
