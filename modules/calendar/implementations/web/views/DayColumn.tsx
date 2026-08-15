// Mobile-first single-day column. The whole 24h fits the viewport — top edge is
// 00:00, bottom edge is 23:59 — so there is no scroll fighting the drag gesture.
// Press (pointer down) starts a task, release ends it → onCreate(start, end).
// All-day events paint their whole day column in their colour (not a header
// banner). Pointer Events cover mouse + touch from one code path.

import { useEffect, useRef, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { SNAP, ZOOM_PAD, assignLanes, atMinute, colorOf, fmt, minuteFromPointer, sameDay, spanFor } from './timeGrid.ts'
import { useEventEdit } from './useEventEdit.ts'

interface Props {
  day: Date
  events?: YCalendarEvent[]
  onCreate?: (start: Date, end: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
  onUpdate?: (event: YCalendarEvent, start: Date, end: Date) => void
  focusId?: string | null
  onFocusChange?: (id: string | null) => void
}

interface Draft { aMin: number; bMin: number }
interface Pending { lo: number; hi: number }

// Round confirm (✓) / cancel (✕) buttons on a staged create.
function pendingBtn(primary: boolean): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: primary ? 'none' : '1px solid var(--border, #d4cfc9)',
    background: primary ? 'var(--accent, #b5936a)' : 'var(--bg-elevated, #fff)',
    color: primary ? '#fff' : 'var(--fg, #1a1a1a)',
    fontSize: 16,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    touchAction: 'none',
  }
}

export function DayColumn({ day, events = [], onCreate, onEventClick, onUpdate, focusId, onFocusChange }: Props) {
  const edit = useEventEdit({ onUpdate, focusId, onFocusChange })
  const shown = edit.withPreview(events)
  const allDay = shown.filter((e) => e.allDay)
  const timed = shown.filter((e) => !e.allDay)
  const lanes = assignLanes(timed, day)
  const interactive = !!onCreate
  const colRef = useRef<HTMLDivElement>(null)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const drag = useRef<{ rect: DOMRect; aMin: number } | null>(null)

  useEffect(() => {
    if (!draft) return
    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      setDraft({ aMin: d.aMin, bMin: minuteFromPointer(e.clientY, d.rect) })
    }
    function onUp(e: PointerEvent) {
      const d = drag.current
      if (d && onCreate) {
        const b = minuteFromPointer(e.clientY, d.rect)
        let lo = Math.min(d.aMin, b)
        let hi = Math.max(d.aMin, b)
        if (hi - lo < SNAP) hi = Math.min(lo + 60, 1440) // tap → default 1h block
        // Stage it — user confirms or cancels before it's created.
        setPending({ lo, hi })
      }
      drag.current = null
      setDraft(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draft, onCreate, day])

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (pending) { setPending(null); return } // tapping away discards a staged create
    if (edit.focusId) { edit.setFocusId(null); return } // empty tap while focused → just unfocus
    if (!interactive || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const m = minuteFromPointer(e.clientY, rect)
    drag.current = { rect, aMin: m }
    setDraft({ aMin: m, bMin: m })
  }

  function confirmPending() {
    if (!pending || !onCreate) return
    const { lo, hi } = pending
    setPending(null)
    onCreate(atMinute(day, lo), atMinute(day, hi))
  }

  const now = new Date()
  const nowFrac = sameDay(day, now) ? (now.getHours() * 60 + now.getMinutes()) / 1440 : null
  const pct = (min: number) => `${(min / 1440) * 100}%`

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, position: 'relative', fontFamily: 'inherit' }}>
      {/* Hour rail */}
      <div style={{ width: 42, flexShrink: 0, position: 'relative', borderRight: '1px solid var(--border, #d4cfc9)' }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: pct(h * 60),
              right: 6,
              transform: h === 0 ? 'translateY(0)' : 'translateY(-50%)',
              fontSize: 10,
              color: 'var(--muted-foreground, #6b6560)',
              lineHeight: 1,
            }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Day column */}
      <div
        ref={colRef}
        onPointerDown={startDrag}
        style={{
          flex: 1,
          position: 'relative',
          cursor: interactive ? 'crosshair' : 'default',
          touchAction: 'none',
          // A focused event grows past the column, and a staged create shows
          // buttons beyond its edges — let both spill instead of clipping.
          overflow: edit.focusId || pending ? 'visible' : 'hidden',
          zIndex: edit.focusId || pending ? 3 : undefined,
        }}
      >
        {/* Hour grid lines */}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: pct(h * 60),
              left: 0,
              right: 0,
              borderTop: '1px solid var(--border, #d4cfc9)',
              opacity: h === 0 ? 0 : 0.6,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* All-day events: full-column colour blocks, split into equal slices */}
        {allDay.map((e, i) => (
          <div
            key={e.id}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => onEventClick?.(e)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(i / allDay.length) * 100}%`,
              width: `${(1 / allDay.length) * 100}%`,
              background: colorOf(e),
              opacity: 0.9,
              borderRight: allDay.length > 1 ? '1px solid rgba(255,255,255,0.3)' : undefined,
              color: '#fff',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '8px 4px',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            {e.title}
          </div>
        ))}

        {/* Draft preview during a drag */}
        {draft && (() => {
          const lo = Math.min(draft.aMin, draft.bMin)
          const hi = Math.max(draft.aMin, draft.bMin)
          return (
            <div
              style={{
                position: 'absolute',
                top: pct(lo),
                height: pct(Math.max(hi - lo, SNAP)),
                left: 2,
                right: 2,
                background: 'color-mix(in srgb, var(--accent, #b5936a) 35%, transparent)',
                border: '1px solid var(--accent, #b5936a)',
                borderRadius: 6,
                zIndex: 4,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'flex-start',
                padding: '2px 6px',
                fontSize: 11,
                color: 'var(--fg, #1a1a1a)',
              }}
            >
              {fmt(lo)}–{fmt(hi)}
            </div>
          )
        })()}

        {/* Staged create — confirm/cancel pill until the user commits it */}
        {pending && (() => {
          const { lo, hi } = pending
          return (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: pct(lo),
                  height: pct(Math.max(hi - lo, SNAP)),
                  left: 2,
                  right: 2,
                  background: 'color-mix(in srgb, var(--accent, #b5936a) 30%, transparent)',
                  border: '1px dashed var(--accent, #b5936a)',
                  borderRadius: 6,
                  zIndex: 4,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '2px 6px',
                  fontSize: 11,
                  color: 'var(--fg, #1a1a1a)',
                }}
              >
                {fmt(lo)}–{fmt(hi)}
              </div>
              <div
                onPointerDown={(ev) => ev.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: `calc(${pct((lo + hi) / 2)})`,
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  gap: 8,
                  zIndex: 10,
                }}
              >
                <button onClick={confirmPending} title="Crear" style={pendingBtn(true)}>✓</button>
                <button onClick={() => setPending(null)} title="Cancelar" style={pendingBtn(false)}>✕</button>
              </div>
            </>
          )
        })()}

        {/* Timed events */}
        {timed.map((e) => {
          const { top, bot } = spanFor(e, day)
          const l = lanes.get(e.id) ?? { lane: 0, lanes: 1 }
          const gap = 1
          const focused = edit.focusId === e.id && edit.canEdit(e)
          // Focused → grow the box in real px (font/radius stay put); drop back
          // while dragging so the geometry under the finger reads true.
          const zoomed = focused && !edit.preview
          const px = zoomed ? ZOOM_PAD.x : 0
          const py = zoomed ? ZOOM_PAD.y : 0
          return (
            <div
              key={e.id}
              onPointerDown={(ev) => {
                ev.stopPropagation()
                if (!colRef.current) return
                const rect = colRef.current.getBoundingClientRect()
                if (focused) edit.beginEdit(ev, e, 'move', rect, day) // already focused → grab now
                else edit.pressEvent(ev, e, rect, day) // long-press to pick up
              }}
              onClick={() => {
                if (edit.wasDrag()) return
                if (edit.canEdit(e) && edit.focusId !== e.id) edit.setFocusId(e.id)
                else onEventClick?.(e)
              }}
              style={{
                position: 'absolute',
                top: `calc(${pct(top)} - ${py}px)`,
                height: `calc(${pct(bot - top)} + ${py * 2}px)`,
                left: `calc(${(l.lane / l.lanes) * 100}% + 2px - ${px}px)`,
                width: `calc(${(1 / l.lanes) * 100}% - ${gap + 3}px + ${px * 2}px)`,
                background: colorOf(e),
                color: '#fff',
                borderRadius: 6,
                padding: '2px 6px',
                fontSize: 11,
                lineHeight: 1.25,
                overflow: 'hidden',
                cursor: focused ? 'grab' : 'pointer',
                touchAction: 'none',
                zIndex: focused ? 8 : 2,
                boxShadow: focused ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.15)',
                transition: 'top 0.15s ease, height 0.15s ease, left 0.15s ease, width 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{e.title}</div>
              {bot - top >= 40 && (
                <div style={{ opacity: 0.85, fontSize: 10 }}>{fmt(top)}–{fmt(bot)}</div>
              )}
            </div>
          )
        })}

        {/* Focus overlay — ring + resize handles over the focused event */}
        {(() => {
          const fe = timed.find((e) => e.id === edit.focusId)
          if (!fe || !edit.canEdit(fe)) return null
          const { top, bot } = spanFor(fe, day)
          const l = lanes.get(fe.id) ?? { lane: 0, lanes: 1 }
          const px = !edit.preview ? ZOOM_PAD.x : 0
          const py = !edit.preview ? ZOOM_PAD.y : 0
          const grab = (ev: React.PointerEvent, mode: 'start' | 'end') => {
            if (colRef.current) edit.beginEdit(ev, fe, mode, colRef.current.getBoundingClientRect(), day)
          }
          const handle: React.CSSProperties = {
            position: 'absolute',
            left: '50%',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            border: `2px solid ${colorOf(fe)}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            cursor: 'ns-resize',
            touchAction: 'none',
            pointerEvents: 'auto',
            zIndex: 7,
          }
          return (
            <div
              style={{
                position: 'absolute',
                top: `calc(${pct(top)} - ${py}px)`,
                height: `calc(${pct(bot - top)} + ${py * 2}px)`,
                left: `calc(${(l.lane / l.lanes) * 100}% + 2px - ${px}px)`,
                width: `calc(${(1 / l.lanes) * 100}% - 4px + ${px * 2}px)`,
                border: '2px solid var(--fg, #1a1a1a)',
                borderRadius: 6,
                zIndex: 9,
                pointerEvents: 'none',
                // Track the grown event: same geometry, same px growth.
                transition: 'top 0.15s ease, height 0.15s ease, left 0.15s ease, width 0.15s ease',
              }}
            >
              <div onPointerDown={(ev) => grab(ev, 'start')} style={{ ...handle, top: -8, transform: 'translateX(-50%)' }} />
              <div onPointerDown={(ev) => grab(ev, 'end')} style={{ ...handle, bottom: -8, transform: 'translateX(-50%)' }} />
              {edit.preview && (
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    transform: 'translateY(-100%)',
                    background: 'var(--fg, #1a1a1a)',
                    color: 'var(--bg-elevated, #fff)',
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmt(top)}–{fmt(bot)}
                </div>
              )}
            </div>
          )
        })()}

        {/* Now line */}
        {nowFrac !== null && (
          <div style={{ position: 'absolute', top: `${nowFrac * 100}%`, left: 0, right: 0, height: 0, borderTop: '2px solid var(--danger, #e5484d)', zIndex: 5, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -3, top: -4, width: 7, height: 7, borderRadius: '50%', background: 'var(--danger, #e5484d)' }} />
          </div>
        )}
      </div>
    </div>
  )
}
