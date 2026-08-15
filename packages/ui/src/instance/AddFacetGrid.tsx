// The add-facet strip: a fixed 5×1 grid of facet types. Active types are
// buttons; the remaining slots render as dashed placeholders so future types
// ('dibujo', 'archivo'…) appear without reflowing the panel.

import type { YFacetType } from '@muralink/types'
import { FACET_LABELS } from './FacetSection.tsx'

const SLOTS = 5

export interface AddFacetGridProps {
  types: YFacetType[]
  onAdd: (type: YFacetType) => void
}

export function AddFacetGrid({ types, onAdd }: AddFacetGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SLOTS}, 1fr)`, gap: 6 }}>
      {types.slice(0, SLOTS).map((t) => (
        <button
          key={t}
          onClick={() => onAdd(t)}
          style={{
            padding: '8px 4px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--fg)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + {FACET_LABELS[t]}
        </button>
      ))}
      {Array.from({ length: Math.max(0, SLOTS - types.length) }, (_, i) => (
        <div key={i} aria-hidden style={{ borderRadius: 8, border: '1px dashed var(--border)', minHeight: 32 }} />
      ))}
    </div>
  )
}
