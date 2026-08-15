// One facet of an instance as a module card: header with the type label and a
// "…" menu (delete), body dispatched by facet.type — new facet kinds plug in
// here.

import type { YFacet, YFacetType } from '@muralink/types'
import { ModuleCard } from './ModuleCard.tsx'
import { TodoSection } from './TodoSection.tsx'
import { NoteSection } from './NoteSection.tsx'

export const FACET_LABELS: Record<YFacetType, string> = {
  todo: 'TODO',
  note: 'Nota',
}

export interface FacetSectionProps {
  facet: YFacet
  onChange: (next: YFacet) => void
  onRemove: () => void
  /** Focus the section's first input on mount (just-added facets). */
  autoFocus?: boolean
}

export function FacetSection({ facet, onChange, onRemove, autoFocus }: FacetSectionProps) {
  const setBlocks = (blocks: YFacet['blocks']) => onChange({ ...facet, blocks })
  return (
    <ModuleCard
      header={<div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>{FACET_LABELS[facet.type]}</div>}
      actions={[{ label: 'Eliminar', danger: true, onSelect: onRemove }]}
    >
      {facet.type === 'todo' ? (
        <TodoSection blocks={facet.blocks} onChange={setBlocks} autoFocus={autoFocus} />
      ) : (
        <NoteSection blocks={facet.blocks} onChange={setBlocks} autoFocus={autoFocus} />
      )}
    </ModuleCard>
  )
}
