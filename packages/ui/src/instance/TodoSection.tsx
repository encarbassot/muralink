// Checklist facet body. Thin wrapper over BlockEditor kept as its own
// component so todo-specific affordances (progress count, due dates) have a
// home when they land. Seeds a checkbox when empty — BlockEditor's Enter and
// "+ añadir" already continue checkbox-from-checkbox from there.

import type { YBlock } from '@muralink/types'
import { BlockEditor } from '../blocks/BlockEditor.tsx'
import { newBlock } from '../blocks/blocks.ts'

export interface FacetBlocksProps {
  blocks: YBlock[]
  onChange: (next: YBlock[]) => void
  /** Focus the first input on mount (new sections). */
  autoFocus?: boolean
}

export function TodoSection({ blocks, onChange, autoFocus }: FacetBlocksProps) {
  const seeded = blocks.length > 0 ? blocks : [newBlock('checkbox')]
  return <BlockEditor blocks={seeded} onChange={onChange} autoFocus={autoFocus} />
}
