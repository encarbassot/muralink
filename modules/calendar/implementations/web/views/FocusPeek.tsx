// Non-modal detail card for the focused event. Sits at the bottom edge of the
// calendar like a Google-Maps place card: it shows the event's info and its
// actions (edit / delete) WITHOUT a backdrop, so the calendar behind stays
// fully operable — you can pan, create, or tap another event with it open.

import { useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { colorOf } from './timeGrid.ts'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function FocusPeek({
  event,
  onEdit,
  onDelete,
  onDismiss,
}: {
  event: YCalendarEvent
  onEdit: () => void
  onDelete: () => void
  onDismiss: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const when = event.allDay
    ? `${fmtDay(event.start.iso)} · Todo el día`
    : `${fmtDay(event.start.iso)} · ${fmtTime(event.start.iso)} – ${fmtTime(event.end.iso)}`

  return (
    <div
      // Swallow taps so they don't fall through to the grid, but claim no
      // backdrop — the rest of the calendar keeps receiving pointer events.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        background: 'var(--bg-elevated, #fff)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
        padding: '12px 16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header: colour + title + time, with a close affordance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorOf(event), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.metadata?.['emoji'] ? `${event.metadata['emoji']} ` : ''}{event.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'capitalize' }}>{when}</div>
        </div>
        <button onClick={onDismiss} title="Cerrar" style={iconBtn}>✕</button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onEdit} style={{ ...actionBtn, flex: 1 }}>Editar</button>
        {confirming ? (
          <>
            <button onClick={onDelete} style={{ ...actionBtn, color: '#fff', background: 'var(--danger, #e5484d)', borderColor: 'var(--danger, #e5484d)' }}>
              Sí, eliminar
            </button>
            <button onClick={() => setConfirming(false)} style={actionBtn}>No</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} style={{ ...actionBtn, color: 'var(--danger, #e5484d)', borderColor: 'color-mix(in srgb, var(--danger, #e5484d) 40%, transparent)' }}>
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid var(--border, #d4cfc9)',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  color: 'var(--fg-dim)',
  fontSize: 14,
  cursor: 'pointer',
  flexShrink: 0,
}
