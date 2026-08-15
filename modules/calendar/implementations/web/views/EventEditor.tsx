// Bottom-sheet editor for a single event. Extracted from DayView so every
// mobile surface (day, week) shares it. Edits always land on the BASE record:
// when the tapped event is a virtual recurrence occurrence (id contains '::'),
// writes route through baseIdOf and a hint tells the user the whole series
// changes. The calendar fields (start/end, "Todo el día", recurrence, colour)
// are this app's PRIMARY facet, injected into the shared InstancePanel; every
// other facet (todo lists, notes) renders below it, plus the add-type grid.

import { useEffect, useState } from 'react'
import type React from 'react'
import type { YFacet } from '@muralink/types'
import { BottomSheet, InstancePanel, ModuleCard, blocksToFacets, facetsToBlocks } from '@muralink/ui'
import type { YCalendarEvent } from '../../../types.ts'
import { baseIdOf, formatRRule, isOccurrenceId, parseRRule, type RRuleLite } from '../../../recurrence.ts'
import { useEvents, listProviders } from '../eventsStore.ts'

export const COLORS = ['#b5936a', '#e5484d', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#0d9488']

const EMOJIS = ['📅', '✅', '📝', '💼', '🎉', '⭐', '❤️', '🏠']

const FREQ_OPTIONS: { value: '' | RRuleLite['freq']; label: string }[] = [
  { value: '', label: 'No se repite' },
  { value: 'DAILY', label: 'Cada día' },
  { value: 'WEEKLY', label: 'Cada semana' },
  { value: 'MONTHLY', label: 'Cada mes' },
  { value: 'YEARLY', label: 'Cada año' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// datetime-local <-> ISO, in the device timezone (matches how all views render).
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): Date {
  return new Date(value)
}

function untilToDateInput(until: string | undefined): string {
  if (!until) return ''
  const d = new Date(until)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function EventEditor({ event, onClose }: { event: YCalendarEvent; onClose: () => void }) {
  const update = useEvents((s) => s.update)
  const remove = useEvents((s) => s.remove)
  const moveEvent = useEvents((s) => s.moveEvent)
  const providers = listProviders()

  // All writes target the base record, never a virtual occurrence.
  const baseId = baseIdOf(event.id)
  const isOccurrence = isOccurrenceId(event.id)

  const [title, setTitle] = useState(event.title)
  const [color, setColor] = useState(event.metadata?.['color'] ?? COLORS[0])
  const [emoji, setEmoji] = useState(event.metadata?.['emoji'] ?? '')

  // Wide viewport → VSCode-style lateral panel; narrow → bottom sheet.
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const initialStart = toLocalInput(event.start.iso)
  const initialEnd = toLocalInput(event.end.iso)
  const [startLocal, setStartLocal] = useState(initialStart)
  const [endLocal, setEndLocal] = useState(initialEnd)

  const initialRule = parseRRule(event.rrule)
  const [freq, setFreq] = useState<'' | RRuleLite['freq']>(initialRule?.freq ?? '')
  const [interval, setInterval_] = useState(initialRule?.interval ?? 1)
  const [untilDate, setUntilDate] = useState(untilToDateInput(initialRule?.until))

  const [facets, setFacets] = useState<YFacet[]>(() => event.facets ?? blocksToFacets(event.blocks))

  function quickAllDay() {
    const day = startLocal.slice(0, 10)
    setStartLocal(`${day}T00:00`)
    setEndLocal(`${day}T23:59`)
  }

  async function save() {
    const metadata: Record<string, string> = { ...(event.metadata ?? {}), color: color! }
    if (emoji) metadata['emoji'] = emoji
    else delete metadata['emoji']
    const patch: Partial<YCalendarEvent> = {
      title: title.trim() || 'Sin título',
      metadata,
      facets,
      blocks: facetsToBlocks(facets), // legacy mirror — see types.ts
    }

    // Only touch start/end when the user changed them — an untouched
    // occurrence must not overwrite the base's dates with its own.
    if (startLocal !== initialStart || endLocal !== initialEnd) {
      let start = fromLocalInput(startLocal)
      let end = fromLocalInput(endLocal)
      if (Number.isNaN(start.getTime())) start = new Date(event.start.iso)
      if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 3600_000)
      patch.start = { iso: start.toISOString(), timezone: event.start.timezone }
      patch.end = { iso: end.toISOString(), timezone: event.end.timezone }
      patch.allDay = false
    }

    if (!freq) {
      patch.rrule = '' // empty string clears the recurrence server-side
    } else {
      const rule: RRuleLite = { freq, interval: Math.max(1, interval) }
      if (untilDate) {
        const [y, m, d] = untilDate.split('-').map(Number)
        rule.until = new Date(y!, m! - 1, d!, 23, 59, 59).toISOString()
      }
      patch.rrule = formatRRule(rule)
    }

    await update(baseId, patch)
    onClose()
  }

  // This app's primary facet as a module card: header = emoji + name + "…"
  // menu (colour, emoji, share, delete); body = the calendar fields.
  const calendarPrimary = (
    <ModuleCard
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {emoji && <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="Título del evento"
            style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)' }}
          />
        </div>
      }
      menuExtra={
        <>
          {/* Colour */}
          <div style={{ display: 'flex', gap: 6, padding: '2px 4px' }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--fg)' : '2px solid transparent', cursor: 'pointer' }}
              />
            ))}
          </div>
          {/* Emoji — tap the active one to clear it */}
          <div style={{ display: 'flex', gap: 4, padding: '2px 4px', flexWrap: 'wrap' }}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(emoji === e ? '' : e)}
                style={{
                  fontSize: 16,
                  padding: 2,
                  borderRadius: 6,
                  border: emoji === e ? '2px solid var(--fg)' : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      }
      actions={[
        { label: 'Compartir', disabled: true },
        { label: 'Eliminar', danger: true, onSelect: () => { remove(baseId); onClose() } },
      ]}
    >
      {/* Start / end — instant A to instant B, any datetimes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)' }}>
          <span style={{ width: 52, color: 'var(--fg-dim)' }}>Inicio</span>
          <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} style={pickerStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)' }}>
          <span style={{ width: 52, color: 'var(--fg-dim)' }}>Fin</span>
          <input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} style={pickerStyle} />
        </div>
        <button onClick={quickAllDay} style={{ ...navBtn, alignSelf: 'flex-start', fontSize: 12 }}>
          Todo el día (00:00 – 23:59)
        </button>
      </div>

      {/* Recurrence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)', flexWrap: 'wrap' }}>
        <select value={freq} onChange={(e) => setFreq(e.target.value as '' | RRuleLite['freq'])} style={pickerStyle}>
          {FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {freq && (
          <>
            <span style={{ color: 'var(--fg-dim)' }}>cada</span>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval_(Math.max(1, Number(e.target.value) || 1))}
              style={{ ...pickerStyle, width: 52 }}
            />
            <span style={{ color: 'var(--fg-dim)' }}>hasta</span>
            <input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} style={pickerStyle} />
          </>
        )}
      </div>

    </ModuleCard>
  )

  return (
    <BottomSheet onBackdrop={save} side={wide ? 'right' : 'bottom'}>
      {isOccurrence && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 8, padding: '6px 10px' }}>
          Evento repetido — los cambios afectan a todas las repeticiones
        </div>
      )}

      <InstancePanel primary={calendarPrimary} facets={facets} onFacetsChange={setFacets} />

      {/* Move between targets */}
      {providers.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg)' }}>
          <span style={{ color: 'var(--fg-dim)' }}>Guardado en:</span>
          <select
            value={event.spaceId ?? ''}
            onChange={(e) => moveEvent(baseId, e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)' }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <div style={{ flex: 1 }} />
        <button onClick={save} style={{ ...navBtn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '8px 18px', fontWeight: 600 }}>Guardar</button>
      </div>
    </BottomSheet>
  )
}

const pickerStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: 13,
}

export const navBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg-dim)',
  cursor: 'pointer',
  fontSize: 13,
}
