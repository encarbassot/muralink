// Editable vertical block array — the "looks like a text editor but isn't"
// surface. One input per block (no contentEditable). Typing a markdown prefix
// in a paragraph converts the block in place: `# `→heading, `- [ ]`→checkbox.

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { YBlock } from '@muralink/types'
import { applyMarkdownShortcut, newBlock } from './blocks.ts'

const headingFont: Record<number, number> = { 1: 18, 2: 16, 3: 14 }

export function BlockEditor({
  blocks,
  onChange,
  autoFocus,
}: {
  blocks: YBlock[]
  onChange: (next: YBlock[]) => void
  /** Focus the first block's input on mount (new sections). */
  autoFocus?: boolean
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const [pendingFocus, setPendingFocus] = useState<{ id: string; caret: number } | null>(null)

  useEffect(() => {
    if (!autoFocus) return
    const first = blocks[0]
    if (first) inputs.current.get(first.id)?.focus()
    // mount only — later block changes must not steal focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!pendingFocus) return
    const el = inputs.current.get(pendingFocus.id)
    if (el) {
      el.focus()
      el.setSelectionRange(pendingFocus.caret, pendingFocus.caret)
    }
    setPendingFocus(null)
  }, [pendingFocus, blocks])

  const patch = (id: string, changes: Partial<YBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...changes } : b)))

  const handleInput = (block: YBlock, text: string) => {
    if (block.type === 'paragraph') {
      const shortcut = applyMarkdownShortcut(text)
      if (shortcut) {
        patch(block.id, {
          type: shortcut.type,
          level: shortcut.level,
          checked: shortcut.checked,
          text: shortcut.remainder,
        })
        setPendingFocus({ id: block.id, caret: shortcut.remainder.length })
        return
      }
    }
    patch(block.id, { text })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, block: YBlock, index: number) => {
    const el = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const caret = el.selectionStart ?? block.text.length
      const before = block.text.slice(0, caret)
      const after = block.text.slice(caret)
      // A checkbox begets a checkbox; a heading begets a paragraph.
      const next = newBlock(block.type === 'checkbox' ? 'checkbox' : 'paragraph', after)
      const list = blocks.flatMap((b) =>
        b.id === block.id ? [{ ...b, text: before }, next] : [b],
      )
      onChange(list)
      setPendingFocus({ id: next.id, caret: 0 })
      return
    }
    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (block.type !== 'paragraph') {
        e.preventDefault()
        patch(block.id, { type: 'paragraph', level: undefined, checked: undefined })
        setPendingFocus({ id: block.id, caret: 0 })
        return
      }
      const prev = blocks[index - 1]
      if (prev) {
        e.preventDefault()
        const caret = prev.text.length
        onChange(
          blocks
            .filter((b) => b.id !== block.id)
            .map((b) => (b.id === prev.id ? { ...b, text: b.text + block.text } : b)),
        )
        setPendingFocus({ id: prev.id, caret })
      }
      return
    }
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      setPendingFocus({ id: blocks[index - 1]!.id, caret: el.selectionStart ?? 0 })
    }
    if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      e.preventDefault()
      setPendingFocus({ id: blocks[index + 1]!.id, caret: el.selectionStart ?? 0 })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {blocks.map((block, index) => (
        <div key={block.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {block.type === 'checkbox' && (
            <input
              type="checkbox"
              checked={!!block.checked}
              onChange={(e) => patch(block.id, { checked: e.target.checked })}
              style={{ margin: 0, flexShrink: 0 }}
            />
          )}
          <input
            ref={(el) => {
              if (el) inputs.current.set(block.id, el)
              else inputs.current.delete(block.id)
            }}
            value={block.text}
            placeholder={block.type === 'paragraph' ? 'Escribe… (# título, [ ] tarea)' : ''}
            onChange={(e) => handleInput(block, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, block, index)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--fg)',
              padding: '2px 0',
              fontSize: block.type === 'heading' ? (headingFont[block.level ?? 1] ?? 18) : 13,
              fontWeight: block.type === 'heading' ? 700 : 400,
              textDecoration: block.type === 'checkbox' && block.checked ? 'line-through' : 'none',
              opacity: block.type === 'checkbox' && block.checked ? 0.55 : 1,
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = blocks[blocks.length - 1]
          const next = newBlock(last?.type === 'checkbox' ? 'checkbox' : 'paragraph')
          onChange([...blocks, next])
          setPendingFocus({ id: next.id, caret: 0 })
        }}
        style={{
          alignSelf: 'flex-start',
          border: 'none',
          background: 'transparent',
          color: 'var(--muted-fg, #888)',
          fontSize: 12,
          cursor: 'pointer',
          padding: '2px 0',
        }}
      >
        + añadir
      </button>
    </div>
  )
}
