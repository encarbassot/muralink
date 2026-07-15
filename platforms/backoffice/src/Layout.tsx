import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { defaultTheme, themeVars } from '@muralink/ui'
import { useAuth } from './auth-context.tsx'

const NAV = [
  { path: '/', label: 'Instances', icon: '⊞' },
  { path: '/modules', label: 'Modules', icon: '⊟' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', ...themeVars(defaultTheme) }}>
      <nav style={{
        width: 200, display: 'flex', flexDirection: 'column', gap: 2,
        borderRight: '1px solid var(--border)', padding: '16px 8px', flexShrink: 0,
      }}>
        <div style={{ padding: '4px 8px 16px', fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>
          elio
        </div>
        {NAV.map(item => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '8px 10px', borderRadius: 8, textDecoration: 'none', fontSize: 14,
              background: pathname === item.path ? 'var(--muted)' : 'transparent',
              color: pathname === item.path ? 'var(--fg)' : 'var(--muted-fg)',
              fontWeight: pathname === item.path ? 600 : 400,
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted-fg)' }}>
          {user?.email}
        </div>
        <button
          onClick={() => { void handleLogout() }}
          style={{
            display: 'flex', gap: 8, alignItems: 'center', width: '100%',
            padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--muted-fg)', fontSize: 14, textAlign: 'left',
          }}
        >
          Sign out
        </button>
      </nav>
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {children}
      </main>
    </div>
  )
}
