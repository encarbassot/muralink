// The murales dashboard: a responsive card grid of ALL the user's murals (with
// a mini canvas preview per card) plus a create button. Clicking a card opens
// the mural, where the Documento/Canvas tabs live. Master-detail in one view.

import { useEffect, useState } from 'react'
import { CellMenu } from '@muralink/ui'
import type { YMural } from '../../../types.ts'
import { worldCenterOf } from '../engine/canvasLayout.ts'
import { DEFAULT_GROUP_R } from '../engine/semantics.ts'
import { randomMuralEmoji, useMurales } from '../muralesStore.ts'
import { MuralView } from './MuralView.tsx'

// Creation wizard: a centered prompt asking just the title and an emoji
// (random by default — click it to reroll). Enter/Siguiente creates the mural
// with `# titulo` as its first document line and opens it.
function NewMuralWizard({ onCreate, onClose }: {
  onCreate: (title: string, emoji: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState(randomMuralEmoji)

  function submit() {
    if (!title.trim()) return
    onCreate(title.trim(), emoji)
  }

  return (
    <div className="mural-quickadd-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mural-quickadd">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            title="Cambiar emoji"
            onClick={() => setEmoji(randomMuralEmoji())}
            style={{ fontSize: 26, width: 52, height: 52, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', flexShrink: 0 }}
          >
            {emoji}
          </button>
          <input
            autoFocus
            value={title}
            placeholder="Título del mural…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') onClose()
            }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 13, cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() ? 1 : 0.5, flexShrink: 0 }}
          >
            Siguiente
          </button>
        </div>
        <span className="mural-quickadd-hint">El título será la primera línea del mural · click al emoji para cambiarlo</span>
      </div>
    </div>
  )
}

// Normalized minimap of a mural's canvas: circles for groups, dots for texts.
function MiniCanvas({ mural }: { mural: YMural }) {
  const { elements } = mural
  if (elements.length === 0) return null
  const nodes = elements.map((e) => ({ e, c: worldCenterOf(elements, e.id) }))
  const xs = nodes.map((n) => n.c.x)
  const ys = nodes.map((n) => n.c.y)
  const minX = Math.min(0, ...xs) - 80
  const maxX = Math.max(0, ...xs) + 80
  const minY = Math.min(0, ...ys) - 80
  const maxY = Math.max(0, ...ys) + 80
  const span = Math.max(maxX - minX, maxY - minY, 1)
  const norm = (v: number, min: number) => ((v - min) / span) * 100
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', flex: 1, minHeight: 54 }}>
      {nodes.filter((n) => n.e.kind === 'group').map(({ e, c }) => (
        <circle
          key={e.id}
          cx={norm(c.x, minX)}
          cy={norm(c.y, minY)}
          r={Math.max(3, ((e.canvas.r ?? DEFAULT_GROUP_R) / span) * 100)}
          fill="color-mix(in srgb, var(--accent) 10%, transparent)"
          stroke="var(--accent)"
          strokeWidth="0.6"
        />
      ))}
      {nodes.filter((n) => n.e.kind !== 'group').map(({ e, c }) => (
        <circle key={e.id} cx={norm(c.x, minX)} cy={norm(c.y, minY)} r="1.6" fill="var(--fg-dim)" />
      ))}
    </svg>
  )
}

interface Props {
  /** Pre-select a mural on open. */
  initialMuralId?: string
}

export function MuralesApp({ initialMuralId }: Props) {
  const murales = useMurales((s) => s.murales)
  const loaded = useMurales((s) => s.loaded)
  const loadAll = useMurales((s) => s.loadAll)
  const create = useMurales((s) => s.create)
  const remove = useMurales((s) => s.remove)

  const [activeId, setActiveId] = useState<string | undefined>(initialMuralId)
  const [wizard, setWizard] = useState(false)
  const [menu, setMenu] = useState<{ mural: YMural; anchor: { top: number; right: number } } | null>(null)

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  // Follow a new target while already mounted (e.g. dock quick action
  // "Nuevo mural" creates one and routes here with its id).
  useEffect(() => {
    if (initialMuralId) setActiveId(initialMuralId)
  }, [initialMuralId])

  if (activeId && murales.some((m) => m.id === activeId)) {
    return (
      <MuralView
        muralId={activeId}
        onBack={() => setActiveId(undefined)}
        onOpenMural={(id) => { if (murales.some((m) => m.id === id)) setActiveId(id) }}
      />
    )
  }

  async function handleCreate(title: string, emoji: string) {
    const m = await create({ title, emoji })
    setWizard(false)
    setActiveId(m.id)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 16, position: 'relative' }}>
      {wizard && (
        <NewMuralWizard onCreate={(t, e) => void handleCreate(t, e)} onClose={() => setWizard(false)} />
      )}
      <div className="mural-list">
        <button className="mural-card new" onClick={() => setWizard(true)}>
          <span style={{ fontSize: 28, opacity: 0.6 }}>＋</span>
          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Nuevo mural</span>
        </button>
        {murales.map((m) => {
          const files = m.elements.filter((e) => e.kind === 'file').length
          const texts = m.elements.filter((e) => e.kind === 'markdown' && (e.text ?? '').trim() !== '').length
          return (
            <button
              key={m.id}
              className="mural-card"
              onClick={() => setActiveId(m.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ mural: m, anchor: { top: e.clientY + 4, right: window.innerWidth - e.clientX } })
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'left' }}>
                {m.emoji ? `${m.emoji} ` : ''}{m.title || 'Sin título'}
              </div>
              <MiniCanvas mural={m} />
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--fg-faint)', width: '100%' }}>
                {texts > 0 && <span>📝 {texts}</span>}
                {files > 0 && <span>📎 {files}</span>}
                <span style={{ flex: 1 }} />
                <span>{new Date(m.updatedAt).toLocaleDateString('es-ES')}</span>
              </div>
            </button>
          )
        })}
        {loaded && murales.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--fg-faint)' }}>
            Aún no hay murales. Crea el primero para empezar.
          </div>
        )}
      </div>

      {menu && (
        <CellMenu
          items={[
            { id: 'open', label: 'Abrir', icon: '📂', group: 'main', onSelect: () => setActiveId(menu.mural.id) },
            {
              id: 'delete',
              label: 'Eliminar',
              icon: '🗑️',
              danger: true,
              group: 'danger',
              onSelect: () => {
                if (confirm(`¿Eliminar «${menu.mural.title}»?`)) void remove(menu.mural.id)
              },
            },
          ]}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
