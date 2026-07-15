// Orchester view — the desktop-only surface. Talks to the orchester daemon via
// the Electron preload bridge (window.orchesterApi). Shown only when
// env.hasOrchester is true, so it never appears on the web.

import { useEffect, useState } from 'react'

interface ManagedService {
  id: string
  label: string
  description?: string
  port?: number
  path?: string
  status: 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

interface AccountStatus {
  linked: boolean
  email?: string
  instanceId?: string
  tunnelBaseUrl?: string
  online?: boolean
}

interface LinkParams {
  tunnelBaseUrl: string
  email: string
  password: string
  label: string
}

interface OrchesterApi {
  getStatus(): Promise<ManagedService[]>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  restart(id: string): Promise<void>
  onStatusChange?(cb: (s: ManagedService[]) => void): () => void
  accountStatus?(): Promise<AccountStatus>
  accountLogin?(params: LinkParams): Promise<AccountStatus>
  accountLogout?(): Promise<AccountStatus>
}

declare global {
  interface Window { orchesterApi?: OrchesterApi }
}

const DOT: Record<ManagedService['status'], string> = {
  running: '🟢', starting: '🟡', stopped: '⚪', error: '🔴',
}

export function OrchesterView() {
  const api = typeof window !== 'undefined' ? window.orchesterApi : undefined
  const [services, setServices] = useState<ManagedService[]>([])

  useEffect(() => {
    if (!api) return
    void api.getStatus().then(setServices)
    const unsub = api.onStatusChange?.(setServices)
    return () => unsub?.()
  }, [api])

  if (!api) {
    return <div style={{ padding: 16, color: 'var(--fg-faint)' }}>Orchester no disponible en esta plataforma.</div>
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
      <AccountPanel api={api} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {services.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated, #1b2026)' }}>
            <span>{DOT[s.status]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{s.path ?? (s.port ? `:${s.port}` : '')} {s.error ? `· ${s.error}` : ''}</div>
            </div>
            {s.status === 'running' || s.status === 'starting'
              ? <Btn onClick={() => void api.stop(s.id)}>Detener</Btn>
              : <Btn onClick={() => void api.start(s.id)}>Iniciar</Btn>}
            <Btn onClick={() => void api.restart(s.id)}>Reiniciar</Btn>
          </div>
        ))}
        {services.length === 0 && <div style={{ color: 'var(--fg-faint)' }}>Sin servicios.</div>}
      </div>
    </div>
  )
}

// Anonymous-first account link. The instance works fully without this; linking
// to a Tunnel account only UNLOCKS extras (cross-instance backup lands in Fase 2)
// and makes this instance appear on the account's dashboard.
function AccountPanel({ api }: { api: OrchesterApi }) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [tunnelBaseUrl, setTunnelBaseUrl] = useState('http://localhost:4000')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('Mi instancia')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api.accountStatus) return
    void api.accountStatus().then(setStatus).catch(() => setStatus({ linked: false }))
  }, [api])

  // Not wired on this build (e.g. web) — hide the panel entirely.
  if (!api.accountStatus || !api.accountLogin || !api.accountLogout) return null

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const next = await api.accountLogin!({ tunnelBaseUrl, email, password, label })
      setStatus(next)
      setPassword('')
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true); setError(null)
    try {
      setStatus(await api.accountLogout!())
    } finally {
      setBusy(false)
    }
  }

  const box: React.CSSProperties = {
    padding: 14, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg-elevated, #1b2026)', display: 'flex', flexDirection: 'column', gap: 8,
  }
  const inp: React.CSSProperties = {
    padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg, #0b0d10)', color: 'var(--fg, #e6e9ee)', fontSize: 13,
  }

  if (status?.linked) {
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{status.online ? '🟢' : '⚪'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Cuenta Tunnel — {status.email}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              Instancia {status.instanceId?.slice(0, 8)}… · {status.online ? 'en línea' : 'desconectada'}
            </div>
          </div>
          <Btn onClick={() => void logout()}>Cerrar sesión</Btn>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
          Funciones desbloqueadas: aparece en tu panel de instancias. Respaldo entre instancias — próximamente (Fase 2).
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={login} style={box}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Vincular con una cuenta Tunnel</div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
        Opcional. La instancia funciona sin cuenta; registrarte desbloquea funciones extra.
      </div>
      <input style={inp} placeholder="URL del Tunnel" value={tunnelBaseUrl} onChange={(e) => setTunnelBaseUrl(e.target.value)} />
      <input style={inp} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={inp} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input style={inp} placeholder="Nombre de esta instancia" value={label} onChange={(e) => setLabel(e.target.value)} />
      {error && <div style={{ color: '#e5786d', fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={busy || !email || !password} style={{
        padding: '7px 10px', borderRadius: 6, border: '1px solid var(--accent, #4c9fff)',
        background: 'var(--accent, #4c9fff)', color: '#fff', fontSize: 13, cursor: 'pointer',
      }}>
        {busy ? 'Vinculando…' : 'Vincular cuenta'}
      </button>
    </form>
  )
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
