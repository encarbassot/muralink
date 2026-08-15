// Dashboard cell: recent murals at a glance; click-through opens the app.

import { useEffect } from 'react'
import { useMurales } from '../muralesStore.ts'

interface Props {
  onExpand?: (muralId?: string) => void
}

export function MuralesCard({ onExpand }: Props) {
  const murales = useMurales((s) => s.murales)
  const loaded = useMurales((s) => s.loaded)
  const loadAll = useMurales((s) => s.loadAll)

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  return (
    <div className="murales-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 10, boxSizing: 'border-box', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>🧱</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Murales</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {murales.slice(0, 5).map((m) => (
          <div
            key={m.id}
            onClick={() => onExpand?.(m.id)}
            style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
          >
            {m.title || 'Sin título'}
          </div>
        ))}
        {loaded && murales.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Sin murales aún</div>
        )}
      </div>
    </div>
  )
}
