import { Link, useLocation } from 'react-router-dom'
import instanceConfig from '@hair-saloon/instance/config'
import instanceTheme from '@hair-saloon/instance/theme'

const NAV = [
  { path: '/', label: 'Dashboard', icon: '⊞' },
  { path: '/calendar', label: 'Calendario', icon: '◻' },
  { path: '/contacts', label: 'Clientes', icon: '◯' },
  { path: '/appointments', label: 'Reservas', icon: '▷' },
]

interface Props { children: React.ReactNode }

export function Layout({ children }: Props) {
  const { pathname } = useLocation()

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: instanceTheme.font.sans,
      background: instanceTheme.colors.background,
      color: instanceTheme.colors.foreground,
      '--primary': instanceTheme.colors.primary,
      '--primary-foreground': instanceTheme.colors.primaryForeground,
      '--background': instanceTheme.colors.background,
      '--foreground': instanceTheme.colors.foreground,
      '--muted': instanceTheme.colors.muted,
      '--muted-foreground': instanceTheme.colors.mutedForeground,
      '--border': instanceTheme.colors.border,
      '--accent': instanceTheme.colors.accent,
    } as React.CSSProperties}
    >
      {/* Sidebar */}
      <nav style={{
        width: 200, display: 'flex', flexDirection: 'column', gap: 2,
        borderRight: `1px solid ${instanceTheme.colors.border}`,
        padding: '16px 8px', flexShrink: 0,
      }}>
        <div style={{ padding: '4px 8px 16px', fontWeight: 700, fontSize: 16, color: instanceTheme.colors.accent }}>
          {instanceConfig.name}
        </div>
        {NAV.map(item => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
              fontSize: 14,
              background: pathname === item.path ? instanceTheme.colors.muted : 'transparent',
              color: pathname === item.path ? instanceTheme.colors.foreground : instanceTheme.colors.mutedForeground,
              fontWeight: pathname === item.path ? 600 : 400,
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {children}
      </main>
    </div>
  )
}
