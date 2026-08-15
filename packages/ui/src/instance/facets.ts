// Pure helpers for the instance facet model. A facet is a typed section of a
// record; `blocks` on legacy records reads as one implicit facet, and facets
// flatten back into `blocks` so older consumers (inline calendar spans, sync
// mappings) keep working unchanged.

import type { YBlock, YFacet, YFacetType } from '@muralink/types'
import { newBlock } from '../blocks/blocks.ts'

let counter = 0

export function newFacet(type: YFacetType): YFacet {
  const id = `fa-${Date.now()}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, type, blocks: [newBlock(type === 'todo' ? 'checkbox' : 'paragraph')] }
}

/** Legacy adapter: a record with only a flat block array reads as ONE implicit
 * facet — 'todo' when every block is a checkbox, 'note' otherwise. */
export function blocksToFacets(blocks: YBlock[] | undefined): YFacet[] {
  if (!blocks || blocks.length === 0) return []
  const allCheckbox = blocks.every((b) => b.type === 'checkbox')
  return [{ id: 'fa-legacy', type: allCheckbox ? 'todo' : 'note', blocks }]
}

/** Compatibility mirror: flatten facet blocks so legacy consumers keep
 * reading `blocks` unchanged. */
export function facetsToBlocks(facets: YFacet[]): YBlock[] {
  return facets.flatMap((f) => f.blocks)
}

/** Toggle a checkbox by block id across facets (block ids are instance-unique). */
export function toggleBlockInFacets(facets: YFacet[], blockId: string, checked: boolean): YFacet[] {
  return facets.map((f) => ({
    ...f,
    blocks: f.blocks.map((b) => (b.id === blockId ? { ...b, checked } : b)),
  }))
}
