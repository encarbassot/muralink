// App panel host. An "app" (calendar, contacts, storage, orchester, …) is not a
// modal overlay — it fills the main content area beside the persistent dock,
// as a peer of the dashboard. Reuses the CRUD pages + harvested module apps.

import { useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Contacts } from './pages/Contacts.tsx'
import { Appointments } from './pages/Appointments.tsx'
import { Calendar } from './pages/Calendar.tsx'
import { NotesApp } from '@muralink/module-notes/web'
import { StockList } from '@muralink/module-stock/web'
import { stockApi } from './api/index.ts'
import { StorageExplorer } from './StorageExplorer.tsx'
import { OrchesterView } from './OrchesterView.tsx'

export const TITLES: Record<string, { icon: string; label: string }> = {
  calendar: { icon: '📅', label: 'Calendario' },
  contacts: { icon: '👥', label: 'Contactos' },
  appointments: { icon: '📋', label: 'Citas' },
  stock: { icon: '📦', label: 'Inventario' },
  notes: { icon: '📝', label: 'Notas' },
  storage: { icon: '💾', label: 'Almacenamiento NAS' },
  orchester: { icon: '🎛️', label: 'Orchester' },
}

// AppPanel — fills the main content area (beside the dock) with the active app.
// A peer of the dashboard, not an overlay. Esc returns to the dashboard.
export function AppPanel({ viewId, instanceId, onBack }: { viewId: string; instanceId?: string; onBack: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const meta = TITLES[viewId] ?? { icon: '▢', label: viewId }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel, var(--bg-elevated))',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>{meta.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>{meta.label}</span>
        <button
          onClick={onBack}
          title="Volver al panel"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 12, padding: '2px 8px' }}
        >
          ← Panel
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ModalBody moduleId={viewId} instanceId={instanceId} />
      </div>
    </div>
  )
}

function ModalBody({ moduleId, instanceId }: { moduleId: string; instanceId?: string }) {
  switch (moduleId) {
    case 'calendar':
      return <CalendarModalBody />
    case 'contacts':
      return <div style={{ height: '100%', padding: 16, boxSizing: 'border-box' }}><Contacts /></div>
    case 'appointments':
      return <div style={{ height: '100%', padding: 16, boxSizing: 'border-box' }}><Appointments /></div>
    case 'stock':
      return <StockModalBody />
    case 'notes':
      return <NotesApp initialNoteId={instanceId} />
    case 'storage':
      return <StorageExplorer />
    case 'orchester':
      return <OrchesterView />
    default:
      return null
  }
}

// The full-screen calendar: mobile-first day surface with N storage targets.
// Self-contained (registers the api target, owns its store + polling).
function CalendarModalBody() {
  return <Calendar />
}

function StockModalBody(): ReactNode {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.getItems() })
  const adjust = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => stockApi.adjust(id, delta),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['stock'] }) },
  })
  return (
    <div style={{ height: '100%', padding: 16, boxSizing: 'border-box' }}>
      <StockList items={items} onAdjust={(id, delta) => adjust.mutate({ id, delta })} />
    </div>
  )
}
