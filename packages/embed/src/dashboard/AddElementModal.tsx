import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { ModuleDescriptor } from '@muralink/shell'

interface Props {
  descriptors: ModuleDescriptor[]
  onPick: (descriptor: ModuleDescriptor) => void
  /** Omnibar fallback: no widget matched the query → create a note with this text. */
  onCreateNote: (text: string) => void
  onClose: () => void
}

function matches(d: ModuleDescriptor, q: string): boolean {
  const hay = `${d.label} ${d.description} ${d.moduleId}`.toLowerCase()
  return q.split(/\s+/).every((tok) => hay.includes(tok))
}

export function WebAddElementModal({ descriptors, onPick, onCreateNote, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? descriptors.filter((d) => matches(d, q)) : descriptors),
    [descriptors, q],
  )
  // Fallback surfaces only once the user typed something with no widget match.
  const showFallback = q.length > 0 && filtered.length === 0

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter') {
      const first = filtered[0]
      if (first) onPick(first)
      else if (query.trim()) onCreateNote(query.trim())
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
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
        onKeyDown={onKeyDown}
        style={{
          width: 460,
          maxWidth: '92vw',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong, var(--border))',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: 18,
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar widget o escribir una nota…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--fg)',
            fontSize: 13,
            outline: 'none',
          }}
        />

        {showFallback ? (
          <button
            onClick={() => onCreateNote(query.trim())}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px dashed var(--accent, #4c9fff)',
              background: 'var(--accent-dim, rgba(76,159,255,0.12))',
              color: 'var(--fg)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>📝</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Crear nota</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                “{query.trim()}”
              </span>
            </span>
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {filtered.map((d) => (
              <button
                key={d.moduleId}
                onClick={() => onPick(d)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{d.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
