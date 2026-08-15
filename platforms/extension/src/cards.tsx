// The extension's cell registry: each card is the SAME module component the
// web app uses, in its most minimal shape, with focus surfaces (ActionRows /
// EdgePanels) declared via the new CellModule.focusSurfaces contract.

import { useEffect, useState } from 'react'
import { CellRegistry, type CellContext, type CellModule } from '@muralink/shell'
import { ActionButton, useActionSurface } from '@muralink/ui'
import { PostitCard, useNotes } from '@muralink/module-notes/web'
import { DayStrip, useEvents } from '@muralink/module-calendar/web'
import type { GridCellRecord } from '@muralink/types'

const POSTIT_COLORS = ['#fef3c7', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff']

// ── Notes: search flyout (the magnifier → search-bar replacement flow) ───────
function NoteSearch({ onPick }: { onPick: (noteId: string) => void }) {
  const notes = useNotes((s) => s.notes)
  const surface = useActionSurface()
  const [q, setQ] = useState('')
  const hits = notes
    .filter((n) => (n.title + '\n' + n.body).toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
      <input
        autoFocus
        value={q}
        placeholder="Buscar nota…"
        onChange={(e) => setQ(e.target.value)}
        style={{
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid var(--border, #262c34)',
          background: 'var(--bg, #0b0d10)',
          color: 'var(--fg, #e6e9ee)',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {hits.map((n) => (
        <button
          key={n.id}
          onClick={() => {
            onPick(n.id)
            surface?.close()
          }}
          style={{
            textAlign: 'left',
            padding: '5px 8px',
            border: 'none',
            borderRadius: 7,
            background: 'transparent',
            color: 'var(--muted-fg, #9aa4b2)',
            cursor: 'pointer',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}
        >
          {n.title || n.body.slice(0, 40) || 'Sin título'}
        </button>
      ))}
      {hits.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-faint, #6b7280)', padding: '2px 8px' }}>Sin resultados</div>
      )}
    </div>
  )
}

function setCardProps(ctx: CellContext, cell: GridCellRecord, patch: Record<string, unknown>) {
  ctx.updateCell?.(cell.id, { props: { ...cell.props, ...patch } })
}

const notesPostit: CellModule = {
  descriptor: {
    moduleId: 'notes-postit',
    label: 'Post-it',
    icon: '📝',
    description: 'Nota rápida estilo post-it',
    defaultSize: '2x2',
    availableSizes: ['2x2'],
  },
  render: (cell, ctx) => (
    <PostitCard
      noteId={cell.props?.['noteId'] as string | undefined}
      color={cell.props?.['color'] as string | undefined}
      onNoteCreated={(noteId) => setCardProps(ctx, cell, { noteId })}
    />
  ),
  focusSurfaces: [
    {
      id: 'postit-actions',
      edge: 'bottom',
      kind: 'actions',
      render: (cell, ctx) => <PostitActions cell={cell} ctx={ctx} />,
    },
  ],
}

function PostitActions({ cell, ctx }: { cell: GridCellRecord; ctx: CellContext }) {
  const create = useNotes((s) => s.create)
  const remove = useNotes((s) => s.remove)
  const noteId = cell.props?.['noteId'] as string | undefined
  return (
    <>
      <ActionButton
        id="postit-new"
        title="Nueva nota"
        onActivate={() => {
          void create({ title: 'Post-it', body: '' }).then((n) => setCardProps(ctx, cell, { noteId: n.id }))
        }}
        label={<span style={{ fontSize: 12, color: 'var(--fg, #e6e9ee)' }}>Nueva nota</span>}
      >
        ＋
      </ActionButton>
      <ActionButton
        id="postit-color"
        title="Color"
        // Sub-options inside the hover chip: nested S-size color buttons.
        label={() => (
          <div style={{ display: 'flex', gap: 4 }}>
            {POSTIT_COLORS.map((c) => (
              <ActionButton
                key={c}
                id={`color-${c}`}
                title={c}
                onActivate={(s) => {
                  setCardProps(ctx, cell, { color: c })
                  s?.close()
                }}
                style={{ background: c, border: '1px solid rgba(0,0,0,0.15)' }}
              >
                <span />
              </ActionButton>
            ))}
          </div>
        )}
      >
        🎨
      </ActionButton>
      <ActionButton
        id="postit-search"
        title="Buscar nota"
        label={<span style={{ fontSize: 12, color: 'var(--fg, #e6e9ee)' }}>Buscar</span>}
        // Activating PINS the search bar into the shared slot — it replaces
        // whatever label chip was there and stays open while typing.
        onActivate={(s) =>
          s?.pin('postit-search', <NoteSearch onPick={(id) => setCardProps(ctx, cell, { noteId: id })} />)
        }
      >
        🔍
      </ActionButton>
      <ActionButton
        id="postit-delete"
        title="Borrar nota"
        label={<span style={{ fontSize: 12, color: 'var(--danger, #f87171)' }}>Borrar nota</span>}
        onActivate={() => {
          if (noteId) void remove(noteId)
          setCardProps(ctx, cell, { noteId: undefined })
        }}
      >
        🗑
      </ActionButton>
    </>
  )
}

// ── Calendar: today's strip ──────────────────────────────────────────────────
function CalendarDayCard() {
  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  useEffect(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    void load(start, end)
  }, [load])
  return <DayStrip events={events} />
}

const calendarDay: CellModule = {
  descriptor: {
    moduleId: 'calendar-day',
    label: 'Hoy',
    icon: '📅',
    description: 'Agenda de hoy',
    defaultSize: '2x2',
    availableSizes: ['2x2'],
  },
  render: () => <CalendarDayCard />,
  focusSurfaces: [
    {
      id: 'calendar-actions',
      edge: 'top',
      kind: 'actions',
      render: () => <CalendarActions />,
    },
  ],
}

function CalendarActions() {
  const reload = useEvents((s) => s.reload)
  const add = useEvents((s) => s.add)
  return (
    <>
      <ActionButton
        id="cal-refresh"
        title="Recargar"
        label={<span style={{ fontSize: 12, color: 'var(--fg, #e6e9ee)' }}>Recargar</span>}
        onActivate={() => void reload()}
      >
        ↻
      </ActionButton>
      <ActionButton
        id="cal-new"
        title="Nuevo evento (1h desde ahora)"
        label={<span style={{ fontSize: 12, color: 'var(--fg, #e6e9ee)' }}>Nuevo evento</span>}
        onActivate={() => {
          const start = new Date()
          const end = new Date(start.getTime() + 60 * 60 * 1000)
          void add(start, end)
        }}
      >
        ＋
      </ActionButton>
    </>
  )
}

export function buildExtensionRegistry(): CellRegistry {
  const registry = new CellRegistry()
  registry.registerAll([notesPostit, calendarDay])
  return registry
}
