// Tunnel guest mount — the third face of @muralink/app, served at /s/:token by the
// Tunnel. User B lands here: it reads the share token from the URL, gates on the
// share password, then renders the SAME StorageExplorer pointed at the per-share
// relay. Storage-only — no bento, no modules. See tunnel/docs/folder-share-relay.md.

import { useEffect, useState } from 'react'
import { MuralGuestView, setMuralStorage } from '@muralink/module-murales/web'
import { StorageExplorer } from './StorageExplorer.tsx'
import { type AppEnv, type GuestRole, AppEnvProvider } from './env.ts'
import { configureApi } from './api/client.ts'
import { storageApi } from './storageApi.ts'
import './styles/tokens.css'
import './styles/module-views.css'
import './styles/base.css'

interface ShareMeta {
  pathLabel: string
  role: GuestRole
  // 'folder' (storage share, default) | 'mural' (one shared mural entity).
  kind?: string
  requiresPassword: boolean
  // Share addressed to one signed-in account (target_email server-side) or
  // open to any signed-in account (require_account server-side).
  requiresAccount?: boolean
}

// /s/<token> → token. Empty if the path is not a share link.
function tokenFromPath(): string {
  const m = window.location.pathname.match(/\/s\/([^/?#]+)/)
  return m?.[1] ?? ''
}

type Phase =
  | { k: 'loading' }
  | { k: 'password'; meta: ShareMeta }
  | { k: 'ready'; env: AppEnv; meta: ShareMeta }
  | { k: 'error'; message: string }

export function TunnelApp({ accountToken }: { accountToken?: string | null } = {}) {
  const token = tokenFromPath()
  const base = window.location.origin
  const shareBase = `${base}/s/${token}`

  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Gate check → guest session → ready env. Shared by the password form and the
  // no-password (public / account-targeted) auto path.
  async function access(meta: ShareMeta, pwd: string | null): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // Account-targeted shares authenticate with the signed-in account session.
    if (accountToken) headers['Authorization'] = `Bearer ${accountToken}`
    const res = await fetch(`${shareBase}/access`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pwd ? { password: pwd } : {}),
    })
    if (res.status === 403) {
      throw new Error(meta.requiresAccount && !meta.requiresPassword
        ? 'Este enlace requiere iniciar sesión — entra con tu cuenta en la app y vuelve a abrirlo'
        : 'Contraseña incorrecta')
    }
    if (!res.ok) throw new Error('No se pudo acceder')
    const { guestToken, role } = (await res.json()) as { guestToken: string; role: GuestRole }
    const env: AppEnv = {
      platform: 'tunnel',
      apiBaseUrl: shareBase, // storageApi hits ${shareBase}/api/storage/*
      apiToken: guestToken,
      hasOrchester: false,
      role,
    }
    configureApi(env)
    setPhase({ k: 'ready', env, meta })
  }

  // Load share metadata; without a password gate go straight in.
  useEffect(() => {
    if (!token) { setPhase({ k: 'error', message: 'Enlace inválido' }); return }
    fetch(`${shareBase}/meta`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('Recurso no encontrado')
        if (r.status === 410) throw new Error('Este enlace ha caducado')
        if (!r.ok) throw new Error('No se pudo cargar el recurso')
        return (await r.json()) as ShareMeta
      })
      .then(async (meta) => {
        if (meta.requiresPassword) setPhase({ k: 'password', meta })
        else await access(meta, null)
      })
      .catch((e) => setPhase({ k: 'error', message: String(e.message ?? e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shareBase])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (phase.k !== 'password') return
    setSubmitting(true)
    setAuthError(null)
    try {
      await access(phase.meta, password)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  if (phase.k === 'loading') return <Centered>Cargando…</Centered>
  if (phase.k === 'error') return <Centered>{phase.message}</Centered>

  if (phase.k === 'password') {
    return (
      <Centered>
        <form onSubmit={submitPassword} style={card}>
          <div style={{ fontSize: 13, color: 'var(--fg-faint)' }}>Carpeta compartida</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{phase.meta.pathLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Acceso: {phase.meta.role}
          </div>
          <input
            type="password"
            autoFocus
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />
          {authError && <div style={{ color: '#e5786d', fontSize: 12 }}>{authError}</div>}
          <button type="submit" disabled={submitting || !password} style={button}>
            {submitting ? 'Accediendo…' : 'Acceder'}
          </button>
        </form>
      </Centered>
    )
  }

  // ready — mural or storage shell, depending on the share kind.
  const isMural = phase.meta.kind === 'mural'
  if (isMural) {
    // The mural's file cards serve through the relay with the guest token.
    setMuralStorage({
      uploadResumable: () => Promise.reject(new Error('read-only share')),
      serveUrl: storageApi.serveUrl,
      mkdir: () => Promise.reject(new Error('read-only share')),
    })
  }

  return (
    <AppEnvProvider value={phase.env}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg, #0b0d10)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16 }}>{isMural ? '🧱' : '🗂️'}</span>
          <span style={{ fontWeight: 600 }}>{phase.meta.pathLabel}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>vía Tunnel</span>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          {isMural
            ? <MuralGuestView apiBase={shareBase} token={phase.env.apiToken} />
            : <StorageExplorer />}
        </div>
      </div>
    </AppEnvProvider>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--accent, #4c9fff)',
  background: 'var(--accent, #4c9fff)', color: '#fff', fontSize: 14, cursor: 'pointer',
}
