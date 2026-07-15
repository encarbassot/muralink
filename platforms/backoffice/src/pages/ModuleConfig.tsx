import { useState } from 'react'
import { Card, Button } from '@muralink/ui'

interface ModuleDef {
  id: string
  name: string
  description: string
  icon: string
  pricePerMonth: number
  category: string
  enabled: boolean
}

const ALL_MODULES: Omit<ModuleDef, 'enabled'>[] = [
  { id: 'contacts', name: 'Contacts', description: 'Manage clients and contacts. Shared across modules.', icon: '◯', pricePerMonth: 1, category: 'Core' },
  { id: 'calendar', name: 'Calendar', description: 'Events, availability slots, and scheduling.', icon: '◻', pricePerMonth: 1, category: 'Core' },
  { id: 'appointments', name: 'Appointments', description: 'Book and manage appointments. Requires Contacts + Calendar.', icon: '▷', pricePerMonth: 1, category: 'Booking' },
  { id: 'stock', name: 'Stock', description: 'Inventory and product tracking.', icon: '⊟', pricePerMonth: 1, category: 'Commerce' },
  { id: 'expenses', name: 'Expenses', description: 'Track costs, budgets, and financial flows.', icon: '€', pricePerMonth: 1, category: 'Commerce' },
  { id: 'notes', name: 'Notes', description: 'Markdown notes, private or shared via tunnel.', icon: '✎', pricePerMonth: 1, category: 'Productivity' },
  { id: 'drive', name: 'Drive', description: 'File storage and sharing.', icon: '⊞', pricePerMonth: 1, category: 'Productivity' },
  { id: 'passwords', name: 'Passwords', description: 'Local-first encrypted credential vault.', icon: '⊕', pricePerMonth: 1, category: 'Security' },
  { id: 'url', name: 'URL', description: 'Bookmark and link management.', icon: '⊙', pricePerMonth: 1, category: 'Core' },
]

const BUNDLES = [
  {
    id: 'hair-saloon',
    name: 'Hair Salon',
    description: 'Everything a hair salon needs: clients, bookings, stock, and cash.',
    modules: ['contacts', 'calendar', 'appointments', 'stock'],
    pricePerMonth: 3,
  },
  {
    id: 'service',
    name: 'Service Business',
    description: 'For any service business: contacts, scheduling, expenses, notes.',
    modules: ['contacts', 'calendar', 'appointments', 'expenses', 'notes'],
    pricePerMonth: 4,
  },
]

export function ModuleConfig() {
  const [modules, setModules] = useState<ModuleDef[]>(
    ALL_MODULES.map(m => ({ ...m, enabled: ['contacts', 'calendar', 'appointments'].includes(m.id) }))
  )
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setModules(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))
    setSaved(false)
  }

  function applyBundle(bundleModuleIds: string[]) {
    setModules(prev => prev.map(m => ({ ...m, enabled: bundleModuleIds.includes(m.id) })))
    setSaved(false)
  }

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalMonthly = modules.filter(m => m.enabled).reduce((s, m) => s + m.pricePerMonth, 0)
  const categories = [...new Set(ALL_MODULES.map(m => m.category))]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Modules</h1>
          <div style={{ fontSize: 13, color: 'var(--muted-fg)', marginTop: 2 }}>
            {modules.filter(m => m.enabled).length} active · €{totalMonthly}/month
          </div>
        </div>
        <Button onClick={save} variant={saved ? 'secondary' : 'primary'} size="sm">
          {saved ? '✓ Saved' : 'Save'}
        </Button>
      </div>

      {/* Bundles */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-fg)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Bundles
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {BUNDLES.map(bundle => (
            <Card key={bundle.id} padding={14} style={{ width: 260 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{bundle.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 8 }}>{bundle.description}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 10 }}>
                {bundle.modules.length} modules · €{bundle.pricePerMonth}/month
                <span style={{ color: 'var(--accent)', marginLeft: 6 }}>
                  (save €{bundle.modules.length - bundle.pricePerMonth}/month)
                </span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => applyBundle(bundle.modules)} style={{ width: '100%' }}>
                Apply bundle
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Module list by category */}
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-fg)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modules.filter(m => m.category === cat).map(mod => (
              <Card key={mod.id} padding={14} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{mod.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{mod.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginTop: 2 }}>{mod.description}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginRight: 8, flexShrink: 0 }}>
                  €{mod.pricePerMonth}/mo
                </div>
                <button
                  onClick={() => toggle(mod.id)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: mod.enabled ? 'var(--accent)' : 'var(--muted)',
                    transition: 'background 0.2s',
                    position: 'relative', flexShrink: 0,
                  }}
                  aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`}
                >
                  <span style={{
                    position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                    left: mod.enabled ? 21 : 3,
                  }} />
                </button>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
