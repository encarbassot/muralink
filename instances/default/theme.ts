// Neutral palette. Deliberately plain: an instance that has not chosen a look
// should read as unbranded, not as somebody else's brand.

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
  name: 'default',
  colors: {
    primary: '#1f2933',
    primaryForeground: '#ffffff',
    background: '#fbfbfc',
    foreground: '#1f2933',
    muted: '#eceef1',
    mutedForeground: '#6b7280',
    border: '#d8dbe0',
    accent: '#4c9fff',
  },
  font: {
    sans: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  borderRadius: '8px',
}

export default theme
