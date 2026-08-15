// Read-only mural for a tunnel guest. Fetches the one mural this share grants
// (GET <shareBase>/api/murales/shared, relayed to the owning instance) and
// renders the canvas readOnly. Files ride the storage relay via the host's
// injected serve URL (setMuralStorage).

import { useEffect, useState } from 'react'
import type { YMural } from '../../../types.ts'
import { MuralCanvas } from '../engine/MuralCanvas.tsx'
import { MuralCanvasView } from '../engine/MuralCanvasView.tsx'
import { MuralSurface } from '../engine/mural/MuralSurface.tsx'
import { normalizeMural } from '../muralesStore.ts'
import type { MuralTab } from './MuralView.tsx'

interface Props {
  /** The share base, e.g. https://tunnel.example/s/<token>. */
  apiBase: string
  /** Guest session token issued by the tunnel access gate. */
  token: string
}

const TABS: { id: MuralTab; icon: string; label: string }[] = [
  { id: 'doc', icon: '📄', label: 'Documento' },
  { id: 'mural', icon: '🧱', label: 'Mural' },
  { id: 'canvas', icon: '◯', label: 'Mind-map' },
]

export function MuralGuestView({ apiBase, token }: Props) {
  const [mural, setMural] = useState<YMural | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MuralTab>('doc')

  useEffect(() => {
    // Public shares need no credential; account-targeted ones send the session.
    fetch(`${apiBase}/api/murales/shared`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo cargar el mural (${r.status})`)
        return (await r.json()) as YMural
      })
      .then((m) => setMural(normalizeMural(m)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de red'))
  }, [apiBase, token])

  if (error) {
    return <div style={{ padding: 24, color: 'var(--fg-faint)', fontSize: 13 }}>{error}</div>
  }
  if (!mural) {
    return <div style={{ padding: 24, color: 'var(--fg-faint)', fontSize: 13 }}>Cargando mural…</div>
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px 0' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: 0, flex: 1 }}>
          {mural.emoji ? `${mural.emoji} ` : ''}{mural.title}
        </h1>
      </div>
      <div className="mural-tabs" style={{ padding: '0 24px' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`mural-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'doc' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 24px' }}>
          <MuralCanvas mural={mural} onChange={() => {}} readOnly />
        </div>
      )}
      {tab === 'mural' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MuralSurface mural={mural} onChange={() => {}} readOnly />
        </div>
      )}
      {tab === 'canvas' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MuralCanvasView mural={mural} onChange={() => {}} readOnly />
        </div>
      )}
    </div>
  )
}
