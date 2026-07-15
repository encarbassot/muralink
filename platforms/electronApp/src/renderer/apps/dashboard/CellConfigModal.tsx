import { useEffect, useState } from 'react'
import type { GridCellRecord } from '@muralink/types'
import type { BentoSize } from '@muralink/ui'

const ALL_SIZES: BentoSize[] = ['1x1', '2x1', '1x2', '2x2', '2x3', '3x2', '3x3']

interface CellConfigModalProps {
  cell: GridCellRecord
  onClose: () => void
  onRemove: () => void
  onResize: (size: BentoSize) => void
}

export function CellConfigModal({ cell, onClose, onRemove, onResize }: CellConfigModalProps) {
  const [pendingSize, setPendingSize] = useState<BentoSize>(cell.size)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleApplySize() {
    if (pendingSize !== cell.size) onResize(pendingSize)
    onClose()
  }

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: '24px 28px 20px',
          minWidth: 300,
          maxWidth: 400,
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
              Configure widget
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              {cell.moduleId}{cell.instanceId ? ` · ${cell.instanceId}` : ''} · {cell.id}
            </div>
          </div>
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

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Size selector */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Size
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setPendingSize(s)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${pendingSize === s ? 'var(--accent)' : 'var(--border)'}`,
                  background: pendingSize === s ? 'var(--accent-dim)' : 'var(--bg)',
                  color: pendingSize === s ? 'var(--accent)' : 'var(--fg-dim)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: pendingSize === s ? 600 : 400,
                  transition: 'all 0.12s',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleApplySize}
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
            Apply
          </button>
          {confirmRemove ? (
            <>
              <button
                onClick={() => { onRemove(); onClose() }}
                style={{
                  padding: '7px 12px',
                  borderRadius: 7,
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Confirm remove
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                style={{
                  padding: '7px 10px',
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
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              style={{
                padding: '7px 12px',
                borderRadius: 7,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--fg-dim)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
