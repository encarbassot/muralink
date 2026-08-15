import { useState } from 'react'
import type { ModuleDescriptor, ModuleVariant } from '@muralink/shell'
import { Omnibar, translateModule, type OmnibarContext } from '@muralink/omnibar'

interface Props {
  descriptors: ModuleDescriptor[]
  onPick: (descriptor: ModuleDescriptor, variant?: ModuleVariant) => void
  /** Omnibar fallback: no widget matched the query → create a note with this text. */
  onCreateNote: (text: string) => void
  onClose: () => void
  /** Where the omnibar was invoked from (selection, grid slot…). */
  context?: OmnibarContext
}

function matches(d: ModuleDescriptor, q: string): boolean {
  const hay = `${d.label} ${d.description} ${d.moduleId}`.toLowerCase()
  return q.split(/\s+/).every((tok) => hay.includes(tok))
}

function filterDescriptors(descriptors: ModuleDescriptor[], query: string): ModuleDescriptor[] {
  const q = query.trim().toLowerCase()
  return q ? descriptors.filter((d) => matches(d, q)) : descriptors
}

// Shared tile styling for the 2-column pickers (modules and their variants).
const tileStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  cursor: 'pointer',
  textAlign: 'left',
} as const

function PickTile({ icon, label, description, onClick }: { icon: string; label: string; description?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={tileStyle}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{label}</span>
        {description && (
          <span style={{ display: 'block', fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {description}
          </span>
        )}
      </span>
    </button>
  )
}

export function WebAddElementModal({ descriptors, onPick, onCreateNote, onClose, context }: Props) {
  // Android-widget-style second step: the picked module's variants, if any.
  const [variantOf, setVariantOf] = useState<ModuleDescriptor | null>(null)

  function onInject(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    onClose()
  }

  function pick(d: ModuleDescriptor) {
    if (d.variants?.length) setVariantOf(d)
    else onPick(d)
  }

  // Enter with no active module: pick the first matching widget (its first
  // variant when it has them — never dead-end on the variant step), else note.
  function onDefaultEnter(query: string) {
    const filtered = filterDescriptors(descriptors, query)
    const first = filtered[0]
    if (first) onPick(first, first.variants?.[0])
    else if (query.trim()) onCreateNote(query.trim())
  }

  function renderResults(query: string) {
    if (variantOf) {
      return (
        <div>
          <button
            onClick={() => setVariantOf(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, background: 'transparent', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            ← Volver
            <span style={{ color: 'var(--fg-faint)' }}>· {variantOf.icon} {variantOf.label}</span>
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {variantOf.variants!.map((v) => (
              <PickTile key={v.id} icon={v.icon} label={v.label} description={v.description} onClick={() => onPick(variantOf, v)} />
            ))}
          </div>
        </div>
      )
    }

    const filtered = filterDescriptors(descriptors, query)
    const showFallback = query.trim().length > 0 && filtered.length === 0
    if (showFallback) {
      return (
        <button
          onClick={() => onCreateNote(query.trim())}
          style={{
            ...tileStyle,
            width: '100%',
            padding: '12px 14px',
            border: '1px dashed var(--accent, #4c9fff)',
            background: 'var(--accent-dim, rgba(76,159,255,0.12))',
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>📝</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Crear nota</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              “{query.trim()}”
            </span>
          </span>
        </button>
      )
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {filtered.map((d) => (
          <PickTile key={d.moduleId} icon={d.icon} label={d.label} description={d.description} onClick={() => pick(d)} />
        ))}
      </div>
    )
  }

  return (
    <Omnibar
      context={context}
      modules={[translateModule]}
      onInject={onInject}
      onClose={onClose}
      onDefaultEnter={onDefaultEnter}
      renderDefaultResults={renderResults}
      placeholder="Buscar widget o escribir una nota…"
    />
  )
}
