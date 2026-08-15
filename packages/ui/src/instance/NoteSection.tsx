// Free-form note facet body — a passthrough over BlockEditor, named so a
// richer note surface can replace it without touching FacetSection.

import { BlockEditor } from '../blocks/BlockEditor.tsx'
import type { FacetBlocksProps } from './TodoSection.tsx'

export function NoteSection({ blocks, onChange, autoFocus }: FacetBlocksProps) {
  return <BlockEditor blocks={blocks} onChange={onChange} autoFocus={autoFocus} />
}
