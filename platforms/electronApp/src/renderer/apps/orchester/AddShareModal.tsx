import { useEffect, useState } from 'react'

interface Props {
  onAdd: (opts: { label: string; path: string; port: number; domain?: string }) => Promise<void>
  onClose: () => void
}

export function AddShareModal({ onAdd, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [path, setPath] = useState('')
  const [port, setPort] = useState('8080')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAdd() {
    const parsedPort = parseInt(port, 10)
    if (!path.trim() || isNaN(parsedPort)) return
    setSaving(true)
    try {
      await onAdd({
        label: label.trim() || path.split('/').pop() || 'Share',
        path: path.trim(),
        port: parsedPort,
        domain: domain.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const canAdd = path.trim().length > 0 && !isNaN(parseInt(port, 10))

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            New folder share
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <Field label="Directory" hint="Folder to expose">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/project/dist"
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={async () => {
                const picked = await window.dialogApi.pickDirectory()
                if (picked) {
                  setPath(picked)
                  if (!label) setLabel(picked.split('/').pop() ?? '')
                }
              }}
              style={browseStyle}
            >
              Browse…
            </button>
          </div>
        </Field>

        <Field label="Label" hint="Shown in Orchester">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Auto from folder name"
            style={inputStyle}
          />
        </Field>

        <Field label="Port" hint="e.g. 8080">
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            min={1}
            max={65535}
            style={inputStyle}
          />
        </Field>

        <Field label="Domain" hint="Optional — for /etc/hosts">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="myshare.local"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => void handleAdd()}
            disabled={!canAdd || saving}
            style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: 7,
              background: canAdd ? 'var(--accent)' : 'var(--bg-elevated)',
              border: canAdd ? 'none' : '1px solid var(--border)',
              color: canAdd ? '#fff' : 'var(--fg-faint)',
              fontSize: 12,
              fontWeight: 600,
              cursor: canAdd && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Adding…' : 'Add share'}
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

const browseStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--fg-dim)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}
