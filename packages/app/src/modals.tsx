// App panel host. An "app" (calendar, contacts, storage, orchester, …) is not a
// modal overlay — it fills the main content area beside the persistent dock,
// as a peer of the dashboard. Reuses the CRUD pages + harvested module apps.

import { useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Contacts } from './pages/Contacts.tsx'
import { Appointments } from './pages/Appointments.tsx'
import { Calendar } from './pages/Calendar.tsx'
import { NotesApp } from '@muralink/module-notes/web'
import { ExpensesApp } from '@muralink/module-expenses/web'
import { MuralesApp, setMuralStorage } from '@muralink/module-murales/web'
import { InventoryApp } from '@muralink/module-stock/web'
import { stockApi } from './api/index.ts'
import { StorageExplorer } from './StorageExplorer.tsx'
import { storageApi } from './storageApi.ts'

// Hand the murales module the app's storage client (one-way dependency: the
// module only knows the seam interface). The storage API confines paths with
// safePathWithin, which needs absolute paths — resolve the NAS root once and
// prefix the module's relative dirs (murales/<id>).
let nasRootPromise: Promise<string> | null = null
const nasRoot = () => (nasRootPromise ??= storageApi.root())
setMuralStorage({
  uploadResumable: async (dir, file, opts) => {
    const root = await nasRoot()
    const r = await storageApi.uploadResumable(`${root}/${dir}`, file, {
      onProgress: (p) => opts?.onProgress?.(p.sent, p.total),
      signal: opts?.signal,
    })
    const path = r.path ?? r.duplicate?.existingPath
    if (!r.ok || !path) throw new Error('upload failed')
    return { path, size: file.size }
  },
  serveUrl: storageApi.serveUrl,
  mkdir: async (path) => {
    const root = await nasRoot()
    return storageApi.mkdir(`${root}/${path}`)
  },
  saveText: (absPath, content) => {
    const slash = absPath.lastIndexOf('/')
    const dir = absPath.slice(0, slash)
    const name = absPath.slice(slash + 1)
    return storageApi.upload(dir, new File([content], name, { type: 'text/markdown' }))
  },
})
import { HabitsApp } from '@muralink/module-habits/web'
import { TodoDashboard } from './TodoDashboard.tsx'
import { GalleryApp } from './GalleryApp.tsx'
import { OrchesterView } from './OrchesterView.tsx'
import { MapsApp } from '@muralink/module-maps/web'
import { MailApp } from '@muralink/module-mail/web'

export const TITLES: Record<string, { icon: string; label: string }> = {
  calendar: { icon: '📅', label: 'Calendario' },
  contacts: { icon: '👥', label: 'Contactos' },
  expenses: { icon: '💰', label: 'Cuentas' },
  appointments: { icon: '📋', label: 'Citas' },
  stock: { icon: '📦', label: 'Inventario' },
  notes: { icon: '📝', label: 'Notas' },
  murales: { icon: '🧱', label: 'Murales' },
  habits: { icon: '✔️', label: 'Hábitos' },
  todo: { icon: '✅', label: 'Tareas' },
  mail: { icon: '✉️', label: 'Correo' },
  storage: { icon: '💾', label: 'Storage' },
  gallery: { icon: '🖼️', label: 'Galería' },
  orchester: { icon: '🎛️', label: 'Orchester' },
  maps: { icon: '🗺️', label: 'Maps' },
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
    case 'expenses':
      return <ExpensesApp initialAccountId={instanceId} />
    case 'murales':
      return <MuralesApp initialMuralId={instanceId} />
    case 'habits':
      return <HabitsApp />
    case 'todo':
      return <TodoDashboard />
    case 'storage':
      return <StorageExplorer />
    case 'gallery':
      return <GalleryApp />
    case 'mail':
      return <MailApp />
    case 'orchester':
      return <OrchesterView />
    case 'maps':
    case 'playground': // legacy id — persisted views from before the rename
      return <MapsApp />
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
  const { data: locations = [] } = useQuery({ queryKey: ['stock', 'locations'], queryFn: () => stockApi.getLocations() })
  const invalidateItems = () => { void qc.invalidateQueries({ queryKey: ['stock'] }) }
  const invalidateLocations = () => { void qc.invalidateQueries({ queryKey: ['stock', 'locations'] }) }

  const createItem = useMutation({
    mutationFn: () => stockApi.createItem({ name: 'Nuevo artículo', quantity: 0, unit: 'ud' }),
    onSuccess: invalidateItems,
  })
  const updateItem = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => stockApi.updateItem(id, patch),
    onSuccess: invalidateItems,
  })
  const deleteItem = useMutation({
    mutationFn: (id: string) => stockApi.deleteItem(id),
    onSuccess: invalidateItems,
  })
  const adjust = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => stockApi.adjust(id, delta),
    onSuccess: invalidateItems,
  })
  const createLocation = useMutation({
    mutationFn: (name: string) => stockApi.createLocation({ name }),
    onSuccess: invalidateLocations,
  })
  const updateLocation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => stockApi.updateLocation(id, { name }),
    onSuccess: invalidateLocations,
  })
  const deleteLocation = useMutation({
    mutationFn: (id: string) => stockApi.deleteLocation(id),
    onSuccess: () => { invalidateLocations(); invalidateItems() },
  })

  return (
    <div style={{ height: '100%' }}>
      <InventoryApp
        items={items}
        locations={locations}
        onCreateItem={() => createItem.mutateAsync()}
        onUpdateItem={(id, patch) => updateItem.mutate({ id, patch })}
        onDeleteItem={(id) => deleteItem.mutate(id)}
        onAdjust={(id, delta) => adjust.mutate({ id, delta })}
        onCreateLocation={(name) => createLocation.mutateAsync(name)}
        onRenameLocation={(id, name) => updateLocation.mutate({ id, name })}
        onDeleteLocation={(id) => deleteLocation.mutate(id)}
      />
    </div>
  )
}
