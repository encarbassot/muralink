// Tunnel multitenant dashboard — the ONLY multi-user surface. Served by the
// Tunnel at `/` (its own origin). A user logs in with email + password and sees
// every instance tied to their account: online now (live agent link) or offline
// with a "last seen" time. Distinct from the guest share view (TunnelApp, /s/:token)
// and from the per-instance data UI (@muralink/app on web/electron).
//
// All calls are same-origin against the Tunnel API: /auth/*, /instances/*.

import { useCallback, useEffect, useState } from 'react'
import './styles/tokens.css'
import './styles/base.css'

const SESSION_KEY = 'elio-tunnel-session'

interface Me {
  id: string
  email: string
}

interface Instance {
  id: string
  label: string
  online: boolean
  lastSeen: string | null
  createdAt: string
}

type Phase =
  | { k: 'loading' }
  | { k: 'login' }
  | { k: 'ready'; me: Me }

export function TunnelDashboard() {
  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [token, setToken] = useState<string>(() => localStorage.getItem(SESSION_KEY) ?? '')

  // Restore session on load.
  useEffect(() => {
    if (!token) { setPhase({ k: 'login' }); return }
    fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error('session expired')
        return (await r.json()) as { user: Me }
      })
      .then((d) => setPhase({ k: 'ready', me: d.user }))
      .catch(() => {
        localStorage.removeItem(SESSION_KEY)
        setToken('')
        setPhase({ k: 'login' })
      })
  }, [token])

  const onLoggedIn = useCallback((newToken: string, me: Me) => {
    localStorage.setItem(SESSION_KEY, newToken)
    setToken(newToken)
    setPhase({ k: 'ready', me })
  }, [])

  const onLogout = useCallback(() => {
    if (token) void fetch('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    localStorage.removeItem(SESSION_KEY)
    setToken('')
    setPhase({ k: 'login' })
  }, [token])

  if (phase.k === 'loading') return <Centered>Cargando…</Centered>
  if (phase.k === 'login') return <LoginForm onLoggedIn={onLoggedIn} />
  return <Dashboard token={token} me={phase.me} onLogout={onLogout} />
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string, me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? (mode === 'login' ? 'Credenciales inválidas' : 'No se pudo registrar'))
        return
      }
      const { token, user } = (await res.json()) as { token: string; user: Me }
      onLoggedIn(token, user)
    } catch {
      setError('Error de red')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <form onSubmit={submit} style={card}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Panel de instancias</div>
        <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
          {mode === 'login' ? 'Inicia sesión en tu cuenta Tunnel' : 'Crea tu cuenta Tunnel'}
        </div>
        <input style={input} type="email" autoFocus placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div style={{ color: '#e5786d', fontSize: 12 }}>{error}</div>}
        <button type="submit" disabled={busy || !email || !password} style={button}>
          {busy ? '…' : mode === 'login' ? 'Entrar' : 'Registrarse'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
          style={{ background: 'none', border: 'none', color: 'var(--accent, #4c9fff)', fontSize: 12, cursor: 'pointer' }}
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </form>
    </Centered>
  )
}

function Dashboard({ token, me, onLogout }: { token: string; me: Me; onLogout: () => void }) {
  const [instances, setInstances] = useState<Instance[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<{ label: string; apiKey: string } | null>(null)

  const auth = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/instances', { headers: auth })
      if (!res.ok) throw new Error('No se pudieron cargar las instancias')
      const d = (await res.json()) as { instances: Instance[] }
      setInstances(d.instances)
    } catch (e) {
      setError(String((e as Error).message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15_000) // refresh presence
    return () => clearInterval(t)
  }, [load])

  async function register() {
    const label = prompt('Nombre de la instancia', 'Mi servidor')
    if (!label) return
    const res = await fetch('/instances/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ label }),
    })
    if (res.ok) {
      const d = (await res.json()) as { label: string; apiKey: string }
      setNewKey({ label: d.label, apiKey: d.apiKey })
      void load()
    }
  }

  async function revoke(id: string) {
    if (!confirm('¿Revocar esta instancia? Perderá el acceso a tu cuenta.')) return
    await fetch(`/instances/${id}`, { method: 'DELETE', headers: auth })
    void load()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0b0d10)', color: 'var(--fg, #e6e9ee)', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 16 }}>🛰️</span>
        <span style={{ fontWeight: 600 }}>Panel de instancias</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{me.email}</span>
        <button onClick={onLogout} style={ghostBtn}>Salir</button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--fg-faint)' }}>Instancias vinculadas a tu cuenta</div>
          <span style={{ flex: 1 }} />
          <button onClick={() => void register()} style={button}>Registrar instancia</button>
        </div>

        {newKey && (
          <div style={{ ...card, width: 'auto', border: '1px solid var(--accent, #4c9fff)' }}>
            <div style={{ fontWeight: 600 }}>Clave de «{newKey.label}» — guárdala ahora</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>No se volverá a mostrar. Pégala en la instancia al vincularla.</div>
            <code style={{ fontSize: 12, wordBreak: 'break-all', padding: 8, background: 'var(--bg, #0b0d10)', borderRadius: 6 }}>{newKey.apiKey}</code>
            <button onClick={() => setNewKey(null)} style={ghostBtn}>Hecho</button>
          </div>
        )}

        {error && <div style={{ color: '#e5786d', fontSize: 12 }}>{error}</div>}
        {instances === null && !error && <div style={{ color: 'var(--fg-faint)' }}>Cargando…</div>}
        {instances?.length === 0 && <div style={{ color: 'var(--fg-faint)' }}>Aún no hay instancias. Registra una y vincúlala desde la app.</div>}

        {instances?.map((inst) => (
          <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated, #1b2026)' }}>
            <span title={inst.online ? 'en línea' : 'desconectada'} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: inst.online ? '#3fb950' : '#6e7681', flex: '0 0 auto',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{inst.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                {inst.online ? 'En línea ahora' : `Última vez: ${formatRelative(inst.lastSeen)}`}
              </div>
            </div>
            <button onClick={() => void revoke(inst.id)} style={ghostBtn}>Revocar</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// "hace 3 semanas" / "nunca" — spanish relative time from an ISO string.
function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'desconocido'
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1],
  ]
  for (const [unit, secs] of units) {
    if (s >= secs || unit === 'second') return rtf.format(-Math.floor(s / secs), unit)
  }
  return 'ahora'
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #0b0d10)', color: 'var(--fg, #e6e9ee)', fontFamily: 'system-ui, sans-serif',
    }}>
      {children}
    </div>
  )
}

const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 24,
  background: 'var(--bg-elevated, #1b2026)', border: '1px solid var(--border)', borderRadius: 12,
}
const input: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg, #0b0d10)', color: 'var(--fg, #e6e9ee)', fontSize: 14,
}
const button: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--accent, #4c9fff)',
  background: 'var(--accent, #4c9fff)', color: '#fff', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--fg, #e6e9ee)', fontSize: 12, cursor: 'pointer',
}
