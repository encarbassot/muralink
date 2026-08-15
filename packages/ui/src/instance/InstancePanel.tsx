// The reusable instance editor body: the host app's own facet first (calendar
// fields, note editor, …), then every other facet as an editable section, then
// the add-type grid. The panel only knows facets — the host owns its primary
// section and persistence, so any module can compose this over its record.

import { useState } from 'react'
import type React from 'react'
import type { YFacet, YFacetType } from '@muralink/types'
import { FacetSection } from './FacetSection.tsx'
import { AddFacetGrid } from './AddFacetGrid.tsx'
import { newFacet } from './facets.ts'

export interface InstancePanelProps {
  /** Host app's own facet UI, rendered first. */
  primary?: React.ReactNode
  facets: YFacet[]
  onFacetsChange: (next: YFacet[]) => void
  /** Types offered in the add grid. Default: todo + note. */
  addableTypes?: YFacetType[]
}

export function InstancePanel({ primary, facets, onFacetsChange, addableTypes = ['todo', 'note'] }: InstancePanelProps) {
  // The just-added facet autofocuses its first input.
  const [freshId, setFreshId] = useState<string | null>(null)
  return (
    <>
      {primary}
      {facets.map((f) => (
        <FacetSection
          key={f.id}
          facet={f}
          autoFocus={f.id === freshId}
          onChange={(next) => onFacetsChange(facets.map((x) => (x.id === f.id ? next : x)))}
          onRemove={() => onFacetsChange(facets.filter((x) => x.id !== f.id))}
        />
      ))}
      <AddFacetGrid
        types={addableTypes}
        onAdd={(t) => {
          const f = newFacet(t)
          setFreshId(f.id)
          onFacetsChange([...facets, f])
        }}
      />
    </>
  )
}
