// Pure helpers for the block document model. Markdown is never stored — a
// typed prefix like `# ` or `- [ ]` converts the block's type and is stripped.

import type { YBlock, YBlockType } from '@muralink/types'

let counter = 0

export function newBlock(type: YBlockType, text = ''): YBlock {
  const id = `blk-${Date.now()}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const block: YBlock = { id, type, text }
  if (type === 'heading') block.level = 1
  if (type === 'checkbox') block.checked = false
  return block
}

export interface ShortcutResult {
  type: YBlockType
  level?: 1 | 2 | 3
  checked?: boolean
  remainder: string
}

const RE_HEADING = /^(#{1,3})\s(.*)$/s
const RE_CHECKBOX = /^(?:-\s)?\[([xX ]?)\]\s(.*)$/s

/**
 * Detect a markdown shortcut prefix in a paragraph's text. Returns the block
 * conversion to apply (and the text with the prefix stripped), or null when
 * the text is plain.
 */
export function applyMarkdownShortcut(text: string): ShortcutResult | null {
  const heading = RE_HEADING.exec(text)
  if (heading) {
    return {
      type: 'heading',
      level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
      remainder: heading[2] ?? '',
    }
  }
  const checkbox = RE_CHECKBOX.exec(text)
  if (checkbox) {
    return {
      type: 'checkbox',
      checked: (checkbox[1] ?? '').toLowerCase() === 'x',
      remainder: checkbox[2] ?? '',
    }
  }
  return null
}
