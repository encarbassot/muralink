import { useEffect, useState } from 'react'
import type { ManagedService } from '@/shared/fsApi'

interface Props {
  service: ManagedService
  onSave: (opts: { port?: number; path?: string; domain?: string }) => void
  onClose: () => void
}

export function ServiceConfigModal({ service, onSave, onClose }: Props) {
  const [port, setPort] = useState(String(service.port ?? ''))
  const [path, setPath] = useState(service.path ?? '')
  const [domain, setDomain] = useState(service.domain ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    const opts: { port?: number; path?: string; domain?: string } = {}
    const parsedPort = parseInt(port, 10)
    if (!isNaN(parsedPort) && parsedPort > 0) opts.port = parsedPort
    if (path.trim()) opts.path = path.trim()
    if (domain.trim()) opts.domain = domain.trim()
    onSave(opts)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: '22px 24px 18px',
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              Configure · {service.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 2 }}>
              Changes apply on next start
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Fields */}
        <Field label="Port" hint="e.g. 80, 3000">
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            min={1}
            max={65535}
            style={inputStyle}
          />
        </Field>

        <Field label="Path" hint="Directory to serve">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/project/dist"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={async () => {
                const picked = await window.dialogApi.pickDirectory()
                if (picked) setPath(picked)
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--fg-dim)',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Browse…
            </button>
          </div>
        </Field>

        <Field label="Domain" hint="Informational — for local /etc/hosts">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="myapp.local"
            style={inputStyle}
          />
        </Field>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: 7,
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--fg-dim)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)' }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit',
}
