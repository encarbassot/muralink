// A note as a POST-IT: the same MarkdownEditor as everywhere else, densified
// and wrapped in the (until now unused) [data-postit] styling from
// @muralink/editor's editor.css — light background, dark text overrides.
// Minimal by design: no toolbar, no chrome; the host provides focus surfaces.

import { useEffect, useRef, useState } from 'react'
import { MarkdownEditor } from '@muralink/editor'
import { useNotes } from '../notesStore.ts'

const DEFAULT_COLOR = '#fef3c7'

export interface PostitCardProps {
  /** Absent → auto-create a blank note on mount (start typing immediately). */
  noteId?: string
  /** Post-it background; falls back to the note's own color, then yellow. */
  color?: string
  /** Called with the id once an auto-created note exists (host persists it). */
  onNoteCreated?: (noteId: string) => void
  onExpand?: () => void
  readOnly?: boolean
}

export function PostitCard({ noteId, color, onNoteCreated, onExpand, readOnly = false }: PostitCardProps) {
  const notes = useNotes((s) => s.notes)
  const loaded = useNotes((s) => s.loaded)
  const loadAll = useNotes((s) => s.loadAll)
  const create = useNotes((s) => s.create)
  const update = useNotes((s) => s.update)

  const [localId, setLocalId] = useState(noteId)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Strict-mode double-effect guard (same pattern as NotesApp autoCreating).
  const autoCreating = useRef(false)

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  useEffect(() => {
    if (noteId) setLocalId(noteId)
  }, [noteId])

  // No target note → create a blank one so the user just types.
  useEffect(() => {
    if (!loaded || localId || readOnly) return
    if (autoCreating.current) return
    autoCreating.current = true
    void create({ title: 'Post-it', body: '' }).then((n) => {
      setLocalId(n.id)
      onNoteCreated?.(n.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, localId, readOnly])

  const note = notes.find((n) => n.id === localId)

  function scheduleSave(body: string) {
    if (!localId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const id = localId
    saveTimer.current = setTimeout(() => void update(id, { body }), 500)
  }
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const bg = color ?? note?.color ?? DEFAULT_COLOR

  return (
    <div
      data-postit={bg}
      onDoubleClick={onExpand}
      style={{
        background: bg,
        borderRadius: 12,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: '8px 10px',
        boxSizing: 'border-box',
      }}
    >
      {note ? (
        <MarkdownEditor
          key={note.id}
          value={note.body}
          onChange={scheduleSave}
          readOnly={readOnly}
          richFormatting
          density="compact"
          placeholder="Escribe…"
        />
      ) : (
        <div style={{ fontSize: 12, color: '#78716c' }}>…</div>
      )}
    </div>
  )
}
