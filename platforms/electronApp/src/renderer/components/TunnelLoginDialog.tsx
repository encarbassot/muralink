import { useState } from 'react'

interface TunnelLoginDialogProps {
  onSuccess: () => void
  onCancel: () => void
}

export function TunnelLoginDialog({ onSuccess, onCancel }: TunnelLoginDialogProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    try {
      await window.tunnelApi.login(email, password)
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 shadow-xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
      >
        <div
          className="mb-1 text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-faint)' }}
        >
          Mural account
        </div>
        <h2 className="mb-5 text-[14px] font-semibold" style={{ color: 'var(--fg)' }}>
          Sign in to share
        </h2>

        <div className="mb-3">
          <label
            className="mb-1 block text-[11px]"
            style={{ color: 'var(--fg-dim)' }}
          >
            Email
          </label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="you@example.com"
            className="w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
            }}
          />
        </div>

        <div className="mb-4">
          <label
            className="mb-1 block text-[11px]"
            style={{ color: 'var(--fg-dim)' }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="••••••••"
            className="w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
            }}
          />
        </div>

        {error && (
          <div className="mb-3 text-[11px]" style={{ color: '#f85149' }}>
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md py-2 text-[12px]"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--fg-dim)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={loading || !email || !password}
            className="flex-1 rounded-md py-2 text-[12px] font-medium"
            style={{
              background: loading || !email || !password ? 'var(--accent-dim)' : 'var(--accent)',
              border: 'none',
              color: '#fff',
              cursor: loading || !email || !password ? 'default' : 'pointer',
              opacity: loading || !email || !password ? .6 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
