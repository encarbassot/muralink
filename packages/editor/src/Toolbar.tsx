// Format toolbar for MarkdownEditor. Migrated verbatim (behavior) from the notes
// module's inline toolbar so every consumer shares one action bar instead of
// re-implementing it. Operates on the live EditorView via the editor's exposed ref.

import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

// ── Editor command helpers (operate on the live EditorView) ──────────────────

export function wrapSelection(view: EditorView, token: string) {
  const tx = view.state.changeByRange((range) => {
    const selected = view.state.doc.sliceString(range.from, range.to)
    const insert = `${token}${selected}${token}`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(range.from + token.length, range.from + token.length + selected.length),
    }
  })
  view.dispatch(view.state.update(tx, { scrollIntoView: true, userEvent: 'input' }))
  view.focus()
}

export function prefixLines(view: EditorView, prefix: string) {
  const { state } = view
  const changes: { from: number; insert: string }[] = []
  const seen = new Set<number>()
  for (const range of state.selection.ranges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = state.doc.lineAt(pos)
      if (!seen.has(line.number)) {
        seen.add(line.number)
        changes.push({ from: line.from, insert: prefix })
      }
      if (line.to >= range.to) break
      pos = line.to + 1
    }
  }
  view.dispatch({ changes })
  view.focus()
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

export interface ToolbarProps {
  editorRef: React.MutableRefObject<EditorView | null>
  /** Current rich (syntax-visible) mode — drives the toggle button state. */
  rich: boolean
  /** Toggle rich/plain. Omit + showRichToggle=false to hide the toggle. */
  onToggleRich?: () => void
  /** Show the rich/plain toggle at the trailing edge (the 'full' variant). */
  showRichToggle?: boolean
}

export function Toolbar({ editorRef, rich, onToggleRich, showRichToggle = true }: ToolbarProps) {
  const run = (fn: (v: EditorView) => void) => () => {
    const v = editorRef.current
    if (v) fn(v)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
      <TBtn title="Bold" onClick={run((v) => wrapSelection(v, '**'))}><strong>B</strong></TBtn>
      <TBtn title="Italic" onClick={run((v) => wrapSelection(v, '*'))}><em>I</em></TBtn>
      <TBtn title="Code" onClick={run((v) => wrapSelection(v, '`'))}>{'</>'}</TBtn>
      <TBtn title="Bullet list" onClick={run((v) => prefixLines(v, '- '))}>•</TBtn>
      <TBtn title="Heading" onClick={run((v) => prefixLines(v, '# '))}>H</TBtn>
      {showRichToggle && onToggleRich ? (
        <>
          <div style={{ flex: 1 }} />
          <TBtn title={rich ? 'Hide markdown syntax' : 'Show markdown syntax'} onClick={onToggleRich} active={rich}>
            {rich ? '⟨⟩' : '¶'}
          </TBtn>
        </>
      ) : null}
    </div>
  )
}

function TBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        minWidth: 26,
        height: 24,
        padding: '0 6px',
        borderRadius: 6,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg)',
        color: active ? 'var(--accent)' : 'var(--fg-dim)',
        cursor: 'pointer',
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}
