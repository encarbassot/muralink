import type { DockItem } from '@muralink/shell'
import { DASHBOARD } from './viewStore.ts'

interface DockOpts {
  activeView: string
  setView: (id: string) => void
  editMode: boolean
  onToggleEdit: () => void
  // Desktop only: a live unix connection to the orchester core.
  hasOrchester?: boolean
}

// Shared dock. Each entry switches the main content view (apps are peers of the
// dashboard, not overlays). The orchester entry appears only when the platform
// has an orchester connection (electron) — the single per-platform difference.
export function makeWebDockItems({ activeView, setView, editMode, onToggleEdit, hasOrchester }: DockOpts): DockItem[] {
  const tab = (id: string, icon: string, label: string): DockItem => ({
    type: 'button',
    id,
    icon: <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>,
    label,
    onClick: () => setView(id),
    active: activeView === id,
  })

  return [
    tab(DASHBOARD, '🏠', 'Panel'),
    tab('calendar', '📅', 'Calendario'),
    tab('contacts', '👥', 'Contactos'),
    tab('appointments', '📋', 'Citas'),
    tab('stock', '📦', 'Inventario'),
    tab('notes', '📝', 'Notas'),
    tab('storage', '💾', 'Almacenamiento NAS'),
    ...(hasOrchester ? [tab('orchester', '🎛️', 'Orchester')] : []),
    {
      type: 'button',
      id: 'edit',
      icon: <span style={{ fontSize: 14, lineHeight: 1, color: editMode ? 'var(--accent)' : undefined }}>✏️</span>,
      label: editMode ? 'Done editing' : 'Edit layout',
      onClick: onToggleEdit,
      active: editMode,
    },
  ]
}
