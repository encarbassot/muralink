import { useEffect, useRef, useState } from 'react'
import type { ShareResult } from '@/shared/fsApi'

interface ShareDialogProps {
  path: string
  onClose: () => void
}

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: null },
  { label: '1 hour', value: 1 * 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
]

export function ShareDialog({ path, onClose }: ShareDialogProps) {
  const [hostIp, setHostIp] = useState('')
  const [password, setPassword] = useState('')
  const [expiryMs, setExpiryMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(true)
  const [result, setResult] = useState<ShareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function detectIp() {
      // Try LAN IP first (synchronous-ish), then public IP
      const lan = await window.tunnelApi.getLanIp()
      if (lan) setHostIp(lan)
      try {
        const pub = await window.tunnelApi.getPublicIp()
        setHostIp(pub)
      } catch {
        // keep LAN IP if public detection fails
      }
      setDetecting(false)
      setTimeout(() => passwordRef.current?.focus(), 50)
    }
    void detectIp()
  }, [])

  async function submit() {
    if (!hostIp || !password) return
    if (password.length < 4) { setError('Password must be at least 4 characters'); return }
    setLoading(true)
    setError(null)
    try {
      const expiresAt = expiryMs ? new Date(Date.now() + expiryMs).toISOString() : null
      const share = await window.tunnelApi.createShare({
        hostIp,
        hostPort: 3131,
        rootPath: path,
        password,
        expiresAt,
      })
      setResult(share)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
      >
        <div
          className="mb-1 text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-faint)' }}
        >
          Share folder
        </div>
        <h2 className="mb-1 truncate text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
          {path.split('/').pop()}
        </h2>
        <div
          className="mb-5 truncate text-[11px]"
          style={{ color: 'var(--fg-faint)' }}
        >
          {path}
        </div>

        {result ? (
          /* ── success state ── */
          <>
            <div
              className="mb-3 rounded-md p-3 text-[11px]"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg-dim)' }}
            >
              <div className="mb-1 text-[10px] uppercase tracking-widest" style={{ color: 'var(--fg-faint)' }}>
                Share link
              </div>
              <div className="break-all font-mono text-[12px]" style={{ color: 'var(--fg)' }}>
                {result.url}
              </div>
              {result.expiresAt && (
                <div className="mt-1" style={{ color: 'var(--fg-faint)' }}>
                  Expires {new Date(result.expiresAt).toLocaleString()}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void copyLink()}
                className="flex-1 rounded-md py-2 text-[12px] font-medium"
                style={{
                  background: copied ? '#238636' : 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2 text-[12px]"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--fg-dim)',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          /* ── form state ── */
          <>
            <div className="mb-3">
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--fg-dim)' }}>
                Host IP {detecting && <span style={{ color: 'var(--fg-faint)' }}>(detecting…)</span>}
              </label>
              <input
                type="text"
                value={hostIp}
                onChange={(e) => setHostIp(e.target.value)}
                placeholder={detecting ? 'Detecting…' : '0.0.0.0'}
                className="w-full rounded-md px-3 py-2 text-[12px] font-mono outline-none"
                style={inputStyle}
              />
              <div className="mt-1 text-[10px]" style={{ color: 'var(--fg-faint)' }}>
                Public IP shown by default. Change to LAN IP for local network only.
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--fg-dim)' }}>
                Access password
              </label>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                placeholder="Minimum 4 characters"
                className="w-full rounded-md px-3 py-2 text-[12px] outline-none"
                style={inputStyle}
              />
            </div>

            <div className="mb-5">
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--fg-dim)' }}>
                Expires
              </label>
              <div className="flex gap-2 flex-wrap">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setExpiryMs(opt.value)}
                    className="rounded-md px-3 py-1 text-[11px]"
                    style={{
                      background: expiryMs === opt.value ? 'var(--accent-dim)' : 'var(--bg)',
                      border: `1px solid ${expiryMs === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      color: expiryMs === opt.value ? 'var(--fg)' : 'var(--fg-dim)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-3 text-[11px]" style={{ color: '#f85149' }}>
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
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
                disabled={loading || !hostIp || !password || detecting}
                className="flex-1 rounded-md py-2 text-[12px] font-medium"
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  cursor: loading || !hostIp || !password || detecting ? 'default' : 'pointer',
                  opacity: loading || !hostIp || !password || detecting ? .5 : 1,
                }}
              >
                {loading ? 'Creating share…' : 'Share folder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
