import { useEffect } from 'react'
import type { ModuleDescriptor } from '@muralink/shell'

interface AddElementModalProps {
  col: number
  row: number
  descriptors: ModuleDescriptor[]
  onAdd: (descriptor: ModuleDescriptor, col: number, row: number) => void
  onClose: () => void
}

export function AddElementModal({ col, row, descriptors, onAdd, onClose }: AddElementModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
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
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: '20px 20px 16px',
          width: 360,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Add widget</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-faint)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 2,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          {descriptors.map((mod) => (
            <button
              key={mod.moduleId}
              onClick={() => { onAdd(mod, col, row); onClose() }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'var(--accent)'
                el.style.background = 'var(--accent-dim)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'var(--border)'
                el.style.background = 'var(--bg)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{mod.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
                  {mod.label}
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)', lineHeight: 1.4 }}>
                {mod.description}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  marginTop: 2,
                }}
              >
                {mod.defaultSize}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
