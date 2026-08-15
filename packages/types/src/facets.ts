// Facets — typed sections of a generic instance. An instance is a LIST of
// facets, not a record with attachments: "calendar" is one facet among many,
// and each viewer app shows its own facet's panel first. Zero dependencies,
// like every primitive here.

import type { YBlock } from './primitives.js'

/** Facet discriminator. Grows additively as viewers land
 *  ('calendar' | 'drawing' | 'file' | 'calcsheet' … are future members —
 *  each needs its own Y*Facet variant + FacetSection renderer before joining). */
export type YFacetType = 'todo' | 'note'

interface YFacetBase {
  id: string // unique within the instance
  type: YFacetType
}

/** Checklist facet — checkbox blocks. */
export interface YTodoFacet extends YFacetBase {
  type: 'todo'
  blocks: YBlock[]
}

/** Free-form note facet — any block types. */
export interface YNoteFacet extends YFacetBase {
  type: 'note'
  blocks: YBlock[]
}

export type YFacet = YTodoFacet | YNoteFacet

// The universal record now lives in `instance.ts` as the generic `Instance<D>`.
// `YInstance` is kept as the facets-only special case (empty typed `data`) so
// existing references to the name keep resolving. Import from here or from
// `instance.ts` — both re-export through the package index.
import type { Instance } from './instance.js'

/** A facets-only instance: the composition model with no typed `data` payload.
 *  Equivalent to the original `YInstance` shape via `Instance`'s `facets`/`id`/
 *  `metadata`/`updatedAt` fields. */
export type YInstance = Instance<Record<string, never>>
