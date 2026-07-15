import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { listSpaces } from '@muralink/spaces'
import { MarkdownEditor } from '../editor/index.ts'
import { useNotes } from '../notesStore.ts'

// ── Editor command helpers (operate on the live EditorView) ──────────────────

function wrapSelection(view: EditorView, token: string) {
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

function prefixLines(view: EditorView, prefix: string) {
  const { state } = view
  const changes = []
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

function Toolbar({
  editorRef,
  rich,
  onToggleRich,
}: {
  editorRef: React.MutableRefObject<EditorView | null>
  rich: boolean
  onToggleRich: () => void
}) {
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
      <div style={{ flex: 1 }} />
      <TBtn title={rich ? 'Hide markdown syntax' : 'Show markdown syntax'} onClick={onToggleRich} active={rich}>
        {rich ? '⟨⟩' : '¶'}
      </TBtn>
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

// ── App ──────────────────────────────────────────────────────────────────────

interface Props {
  /** Pre-select a note on open. */
  initialNoteId?: string
}

export function NotesApp({ initialNoteId }: Props) {
  const notes = useNotes((s) => s.notes)
  const loaded = useNotes((s) => s.loaded)
  const loadAll = useNotes((s) => s.loadAll)
  const create = useNotes((s) => s.create)
  const update = useNotes((s) => s.update)
  const remove = useNotes((s) => s.remove)
  const moveNote = useNotes((s) => s.moveNote)

  const spaces = listSpaces('notes').filter((sp) => !sp.readonly)

  const [activeId, setActiveId] = useState<string | undefined>(initialNoteId)
  const [rich, setRich] = useState(true)
  const editorRef = useRef<EditorView | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards the one-shot auto-create so React strict-mode double effect runs
  // (and re-renders while the async create is in flight) don't spawn extras.
  const autoCreating = useRef(false)

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  // Pick a sensible active note once loaded. When the store is empty, create a
  // blank note automatically so the user lands straight in the editor and can
  // start typing — no "create your first note" click required.
  useEffect(() => {
    if (!loaded) return
    if (notes.length === 0) {
      if (autoCreating.current) return
      autoCreating.current = true
      void create({ title: 'Untitled', body: '' }).then((n) => setActiveId(n.id))
      return
    }
    if (activeId && notes.some((n) => n.id === activeId)) return
    setActiveId(notes[0]?.id)
  }, [loaded, notes, activeId, create])

  const active = notes.find((n) => n.id === activeId)

  function scheduleSave(patch: { title?: string; body?: string }) {
    if (!active) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const id = active.id
    saveTimer.current = setTimeout(() => void update(id, patch), 500)
  }

  async function handleNew() {
    const n = await create({ title: 'Untitled', body: '' })
    setActiveId(n.id)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* Sidebar list */}
      <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Notes</span>
          <button
            onClick={() => void handleNew()}
            title="New note"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14 }}
          >
            +
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => setActiveId(n.id)}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                borderLeft: `2px solid ${n.id === activeId ? (n.color ?? 'var(--accent)') : 'transparent'}`,
                background: n.id === activeId ? 'var(--bg-elevated)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                {new Date(n.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>
              No notes yet
            </div>
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {active ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <input
                value={active.title}
                onChange={(e) => {
                  const title = e.target.value
                  void update(active.id, { title })
                }}
                placeholder="Untitled"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 15, fontWeight: 600 }}
              />
              {spaces.length > 1 && (
                <select
                  value={active.spaceId ?? 'local'}
                  onChange={(e) => void moveNote(active.id, e.target.value)}
                  title="Dónde se guarda esta nota"
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg-dim)', maxWidth: 130 }}
                >
                  {spaces.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.label}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => void remove(active.id)}
                title="Delete note"
                style={{ border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)', background: 'color-mix(in srgb, #ef4444 8%, transparent)', color: '#f87171', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
            <Toolbar editorRef={editorRef} rich={rich} onToggleRich={() => setRich((v) => !v)} />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <MarkdownEditor
                key={active.id}
                value={active.body}
                onChange={(body) => scheduleSave({ body })}
                richFormatting={rich}
                editorRef={editorRef}
                placeholder="Start writing…"
                autoFocus
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--fg-faint)' }}>
            <span style={{ fontSize: 32, opacity: 0.4 }}>📝</span>
            <button
              onClick={() => void handleNew()}
              style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
            >
              Create your first note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
