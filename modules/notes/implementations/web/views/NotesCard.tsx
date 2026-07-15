import { useEffect } from 'react'
import type { GridSize } from '@muralink/types'
import { useNotes } from '../notesStore.ts'

interface Props {
  size: GridSize
  /** Open the full notes editor (modal in web). */
  onExpand?: (noteId?: string) => void
}

// Strip the most common markdown syntax for a calm preview line.
function plain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~-]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

export function NotesCard({ size, onExpand }: Props) {
  const notes = useNotes((s) => s.notes)
  const loaded = useNotes((s) => s.loaded)
  const loadAll = useNotes((s) => s.loadAll)

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  const rows = Number(size.split('x')[1])
  const max = rows >= 3 ? 6 : rows === 2 ? 4 : 2

  return (
    <div
      onClick={() => onExpand?.()}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-elevated)',
        borderRadius: 12,
        padding: 12,
        boxSizing: 'border-box',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>📝</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Notes</span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{notes.length}</span>
      </div>

      {notes.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-faint)',
            fontSize: 11,
            textAlign: 'center',
          }}
        >
          + New note
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
          {notes.slice(0, max).map((n) => (
            <div
              key={n.id}
              onClick={(e) => { e.stopPropagation(); onExpand?.(n.id) }}
              style={{
                borderLeft: `2px solid ${n.color ?? 'var(--accent)'}`,
                paddingLeft: 8,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--fg)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {n.title || 'Untitled'}
              </div>
              {rows >= 2 && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--fg-faint)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {plain(n.body) || 'Empty'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
