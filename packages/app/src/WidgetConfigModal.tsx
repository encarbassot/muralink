import { useEffect, useState } from 'react'
import type { GridCellRecord } from '@muralink/types'
import type { CellContext, CellTab } from '@muralink/shell'

interface WidgetConfigModalProps {
  /** Live cell (re-read from the layout by id each render so tab writes compose). */
  cell: GridCellRecord
  ctx: CellContext
  tabs: CellTab[]
  initialTabId?: string
  /** Props-merge-safe patch (App.updateCell bound to cell.id). */
  onUpdate: (patch: Partial<GridCellRecord>) => void
  onRemove: () => void
  onClose: () => void
}

export function WidgetConfigModal({ cell, ctx, tabs, initialTabId, onUpdate, onRemove, onClose }: WidgetConfigModalProps) {
  const [activeId, setActiveId] = useState(initialTabId && tabs.some((t) => t.id === initialTabId) ? initialTabId : tabs[0]?.id)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 360,
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
          width: 420,
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong, var(--border))',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Configurar widget</div>
            <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{cell.moduleId} · {cell.id}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}
          >
            ×
          </button>
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {tabs.map((t) => {
            const on = t.id === active?.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 10px',
                  border: 'none',
                  borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  background: 'transparent',
                  color: on ? 'var(--fg)' : 'var(--fg-faint)',
                  fontSize: 12,
                  fontWeight: on ? 600 : 400,
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {t.icon && <span style={{ fontSize: 13 }}>{t.icon}</span>}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Active tab body */}
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {active?.render({
            cell,
            ctx,
            setConfig: (value) => onUpdate({ props: { [active.id]: value } }),
            update: onUpdate,
            close: onClose,
          })}
        </div>

        {/* Footer — remove */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {confirmRemove ? (
            <>
              <button
                onClick={() => { onRemove(); onClose() }}
                style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                style={{ padding: '6px 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              style={{ padding: '6px 12px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
            >
              Eliminar widget
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
