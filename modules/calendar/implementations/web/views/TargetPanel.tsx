// Storage targets: N locations, extensible. Toggle which are shown; pick the
// default (where new events land). Never expose disabling the last one.
// Extracted from DayView so the day and week surfaces share it.

import { useEvents, listProviders } from '../eventsStore.ts'
import { navBtn } from './EventEditor.tsx'

export function providerLabel(id: string): string {
  return listProviders().find((p) => p.id === id)?.label ?? id
}

export function TargetPanel({ onClose }: { onClose: () => void }) {
  const activeTargets = useEvents((s) => s.activeTargets)
  const defaultTarget = useEvents((s) => s.defaultTarget)
  const toggleTarget = useEvents((s) => s.toggleTarget)
  const setDefaultTarget = useEvents((s) => s.setDefaultTarget)
  const providers = listProviders()

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg, #f5f2ee)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: 'var(--fg)' }}>Dónde se guardan las citas</span>
        <button onClick={onClose} style={{ ...navBtn, padding: '2px 8px' }}>✕</button>
      </div>
      {providers.map((p) => {
        const on = activeTargets.includes(p.id)
        const isDefault = defaultTarget === p.id
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', fontSize: 13, color: 'var(--fg)' }}>
              <input type="checkbox" checked={on} onChange={() => toggleTarget(p.id)} />
              {p.label}
              {p.local && <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>offline</span>}
            </label>
            <button
              onClick={() => setDefaultTarget(p.id)}
              disabled={isDefault}
              style={{
                ...navBtn,
                fontSize: 11,
                padding: '3px 8px',
                background: isDefault ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                color: isDefault ? 'var(--accent)' : 'var(--fg-dim)',
                cursor: isDefault ? 'default' : 'pointer',
              }}
            >
              {isDefault ? 'Por defecto' : 'Usar'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
