// Account avatar for the dock's lower section. Not logged in → a login form
// (email + password against the cloud). Logged in → the account email + logout.
// Logging in installs the cloud vault so calendar/notes/contacts sync to the
// account; logout reloads to reset every store and space cleanly.

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { CLOUD_ORIGIN, clearAccountToken, fetchMe, getAccountToken, login, logout, setAccountToken, type Account } from './account.ts'
import { installCloudVault, uninstallCloudVault } from './cloudVault.ts'

export function AccountDock() {
  const [account, setAccount] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Validate a restored token on mount (spaces are already registered in
  // main.tsx). Drop it if the cloud says it's stale.
  useEffect(() => {
    const token = getAccountToken()
    if (!token) return
    void fetchMe(token).then((acc) => {
      if (acc) setAccount(acc)
      else { clearAccountToken(); uninstallCloudVault() }
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function onLoggedIn(token: string, user: Account) {
    setAccountToken(token)
    installCloudVault(token, CLOUD_ORIGIN)
    setAccount(user)
    setOpen(false)
  }

  function onLogout() {
    const token = getAccountToken()
    if (token) void logout(token)
    clearAccountToken()
    uninstallCloudVault()
    // Full reset: stores hold merged cloud data, cleanest to reload.
    window.location.reload()
  }

  const initial = account ? (account.email[0] ?? '?').toUpperCase() : '⤓'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        title={account ? account.email : 'Iniciar sesión en Muralink'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: account ? 'var(--accent, #b5936a)' : 'var(--muted, #1b2026)',
          color: account ? '#fff' : 'var(--muted-fg, #9aa4b2)',
          fontSize: 13,
          fontWeight: 600,
          border: '1px solid var(--border, #2a323d)',
          cursor: 'pointer',
        }}
      >
        {initial}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            left: 44,
            bottom: 8,
            zIndex: 10003,
            width: 260,
            padding: 12,
            borderRadius: 12,
            background: 'var(--bg-elevated, #14181e)',
            border: '1px solid var(--border, #262c34)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          }}
        >
          {account ? (
            <AccountPanel account={account} onLogout={onLogout} />
          ) : (
            <LoginForm onLoggedIn={onLoggedIn} />
          )}
        </div>
      )}
    </div>
  )
}

function AccountPanel({ account, onLogout }: { account: Account; onLogout: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--fg-dim, #8b93a1)' }}>Conectado como</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg, #e8eaed)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {account.email}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim, #8b93a1)' }}>
        Calendario, notas y contactos sincronizados con tu cuenta.
      </div>
      <button type="button" onClick={onLogout} style={btn('#ff8080')}>Cerrar sesión</button>
    </div>
  )
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string, user: Account) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token, user } = await login(email.trim(), password)
      onLoggedIn(token, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg, #e8eaed)' }}>Iniciar sesión</div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim, #8b93a1)', marginBottom: 2 }}>{CLOUD_ORIGIN.replace(/^https?:\/\//, '')}</div>
      <input
        type="email"
        autoFocus
        placeholder="Correo"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={input}
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={input}
      />
      {error && <div style={{ fontSize: 11, color: '#ff8080' }}>{error}</div>}
      <button type="submit" disabled={busy || !email || !password} style={btn('var(--accent, #b5936a)', true)}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

const input: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #262c34)',
  background: 'var(--bg, #0f1216)',
  color: 'var(--fg, #e8eaed)',
  fontSize: 13,
  outline: 'none',
}

function btn(color: string, filled = false): React.CSSProperties {
  return {
    padding: '8px 10px',
    borderRadius: 8,
    border: filled ? 'none' : `1px solid ${color}`,
    background: filled ? color : 'transparent',
    color: filled ? '#fff' : color,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }
}
