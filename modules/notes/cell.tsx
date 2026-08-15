// The notes module as a bento cell. Registered by platforms into their
// CellRegistry. Unfocused: the live notes list (NotesCard). First click just
// focuses the cell (via ctx.focusCell, reused here as "focus myself"), same
// two-step interaction every focus-gated cell uses. Once focused, picking a
// note swaps to a real inline markdown editor bound to the shared notes
// store — no modal, matching the "text" cell's live-inline pattern — instead
// of always jumping to the full NotesApp.

import { useRef, useState } from 'react'
import type { CellModule, CellContext } from '@muralink/shell'
import type { GridCellRecord } from '@muralink/types'
import { NotesCard, MarkdownEditor, useNotes } from './implementations/web/index.ts'

function NoteInlineEditor({
  noteId,
  onBack,
  isDragging,
}: {
  noteId: string
  onBack: () => void
  isDragging: boolean
}) {
  const note = useNotes((s) => s.notes.find((n) => n.id === noteId))
  const update = useNotes((s) => s.update)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(next: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void update(noteId, { body: next }), 400)
  }

  if (!note) return null
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onBack}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-faint)', padding: 0 }}
        >
          ← Notas
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title || 'Untitled'}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        <MarkdownEditor value={note.body} onChange={handleChange} readOnly={isDragging} placeholder="Texto…" />
      </div>
    </div>
  )
}

function NotesCellView({ cell, ctx, isDragging }: { cell: GridCellRecord; ctx: CellContext; isDragging: boolean }) {
  const [selected, setSelected] = useState<string | undefined>(undefined)

  function handleExpand(noteId?: string) {
    // Unfocused: first click just focuses this cell (same two-step model as
    // every other focus-gated widget) — it does not jump straight to a note.
    if (!ctx.focused) {
      ctx.focusCell?.(cell.id)
      return
    }
    if (noteId) setSelected(noteId)
    else ctx.openModal?.('notes') // "see all notes" has no small-grid equivalent yet.
  }

  if (ctx.focused && selected) {
    return <NoteInlineEditor noteId={selected} onBack={() => setSelected(undefined)} isDragging={isDragging} />
  }
  return <NotesCard size={cell.size} onExpand={handleExpand} />
}

export const notesCell: CellModule = {
  descriptor: {
    moduleId: 'notes',
    label: 'Notes',
    icon: '📝',
    description: 'Markdown notes — VSCode + Notion style editor',
    defaultSize: '2x2',
    availableSizes: ['1x2', '2x1', '2x2', '2x3', '3x2', '3x3'],
    // 'text' is the simple note view shown in the picker; the full notes app is
    // still registered (renders existing 'notes' cells) but hidden from add.
    hiddenFromPicker: true,
  },
  render: (cell, ctx, isDragging) => <NotesCellView cell={cell} ctx={ctx} isDragging={isDragging} />,
}
