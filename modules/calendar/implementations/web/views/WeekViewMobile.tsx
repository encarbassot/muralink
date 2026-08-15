// Mobile-format week grid: the width splits into 7 day columns, the height
// into 24 hours — the whole week fits the viewport, no scroll fighting the
// drag gesture. Events are drawn per-day: an event crossing midnight paints
// the bottom of its start day and the top of the next (spanFor clamps to each
// day), and a full-day span (00:00–23:59, or any middle day of a longer
// event) paints the whole column. Events carrying blocks render their
// checklist inline when the segment is tall enough.

import { useEffect, useRef, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { BlockList } from '@muralink/ui'
import { SNAP, ZOOM_PAD, assignLanes, atMinute, clamp, colorOf, fmt, minuteFromPointer, pct, sameDay, spanFor } from './timeGrid.ts'
import { useEventEdit } from './useEventEdit.ts'

interface Props {
  weekStart: Date // first day shown, at 00:00
  events?: YCalendarEvent[] // already expanded (recurrences resolved by the host)
  onCreate?: (start: Date, end: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
  onToggleBlock?: (eventId: string, blockId: string, checked: boolean) => void
  onUpdate?: (event: YCalendarEvent, start: Date, end: Date) => void
  focusId?: string | null
  onFocusChange?: (id: string | null) => void
}

// A staged create: the drag is released but not committed — the user still has
// to confirm (or cancel) before the event is born.
interface Pending { dayIdx: number; lo: number; hi: number }

const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// Round confirm (✓) / cancel (✕) buttons on a staged create.
function pendingBtn(primary: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: primary ? 'none' : '1px solid var(--border, #d4cfc9)',
    background: primary ? 'var(--accent, #b5936a)' : 'var(--bg-elevated, #fff)',
    color: primary ? '#fff' : 'var(--fg, #1a1a1a)',
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    touchAction: 'none',
  }
}

// A segment ≥ this many minutes shows its checklist inline.
const BLOCKS_MIN_SPAN = 60

interface Draft { dayIdx: number; aMin: number; bMin: number }

function overlaps(e: YCalendarEvent, from: Date, to: Date): boolean {
  return new Date(e.start.iso) < to && new Date(e.end.iso) > from
}

export function WeekViewMobile({ weekStart, events = [], onCreate, onEventClick, onToggleBlock, onUpdate, focusId, onFocusChange }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const now = new Date()
  const interactive = !!onCreate

  const gridRef = useRef<HTMLDivElement>(null)
  const RAIL_W = 34

  // Day column under a pointer x — lets a body-drag carry the event to
  // another day. Columns are equal-width to the right of the hour rail.
  function dayFromX(clientX: number): Date | null {
    const g = gridRef.current
    if (!g) return null
    const r = g.getBoundingClientRect()
    const frac = (clientX - r.left - RAIL_W) / (r.width - RAIL_W)
    return days[clamp(Math.floor(frac * 7), 0, 6)]!
  }

  const edit = useEventEdit({ onUpdate, dayFromX, focusId, onFocusChange })
  const shown = edit.withPreview(events)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const drag = useRef<{ rect: DOMRect; dayIdx: number; aMin: number } | null>(null)

  useEffect(() => {
    if (!draft) return
    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      setDraft({ dayIdx: d.dayIdx, aMin: d.aMin, bMin: minuteFromPointer(e.clientY, d.rect) })
    }
    function onUp(e: PointerEvent) {
      const d = drag.current
      if (d && onCreate) {
        const b = minuteFromPointer(e.clientY, d.rect)
        let lo = Math.min(d.aMin, b)
        let hi = Math.max(d.aMin, b)
        if (hi - lo < SNAP) hi = Math.min(lo + 60, 1440) // tap → default 1h block
        // Don't create yet — stage it and let the user confirm or cancel.
        setPending({ dayIdx: d.dayIdx, lo, hi })
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
  }, [draft, onCreate])

  function startDrag(e: React.PointerEvent<HTMLDivElement>, dayIdx: number) {
    if (pending) { setPending(null); return } // tapping away discards a staged create
    if (edit.focusId) { edit.setFocusId(null); return } // empty tap while focused → just unfocus
    if (!interactive || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const m = minuteFromPointer(e.clientY, rect)
    drag.current = { rect, dayIdx, aMin: m }
    setDraft({ dayIdx, aMin: m, bMin: m })
  }

  function confirmPending() {
    if (!pending || !onCreate) return
    const { dayIdx, lo, hi } = pending
    setPending(null)
    onCreate(atMinute(days[dayIdx]!, lo), atMinute(days[dayIdx]!, hi))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: 'inherit' }}>
      {/* Day header strip */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <div style={{ width: 34, flexShrink: 0 }} />
        {days.map((d) => {
          const today = sameDay(d, now)
          return (
            <div
              key={d.getTime()}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '4px 0',
                fontSize: 10,
                lineHeight: 1.2,
                color: today ? 'var(--accent, #b5936a)' : 'var(--muted-foreground, #6b6560)',
                fontWeight: today ? 700 : 400,
              }}
            >
              {DAY_LABELS[d.getDay()]}
              <div style={{ fontSize: 12, fontWeight: today ? 700 : 500, color: today ? 'var(--accent, #b5936a)' : 'var(--fg, #1a1a1a)' }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* 24h grid */}
      <div ref={gridRef} style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        {/* Hour rail */}
        <div style={{ width: 34, flexShrink: 0, position: 'relative', borderRight: '1px solid var(--border, #d4cfc9)' }}>
          {Array.from({ length: 8 }, (_, i) => i * 3).map((h) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: pct(h * 60),
                right: 4,
                transform: h === 0 ? 'translateY(0)' : 'translateY(-50%)',
                fontSize: 9,
                color: 'var(--muted-foreground, #6b6560)',
                lineHeight: 1,
              }}
            >
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Hour grid lines across all columns */}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: pct(h * 60),
              left: 34,
              right: 0,
              borderTop: '1px solid var(--border, #d4cfc9)',
              opacity: h === 0 ? 0 : h % 3 === 0 ? 0.6 : 0.25,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dayEnd = new Date(day)
          dayEnd.setDate(day.getDate() + 1)
          const dayEvents = shown.filter((e) => overlaps(e, day, dayEnd))
          // Full-column events: legacy allDay, plus any segment covering the
          // whole day (quick "todo el día" 00:00–23:59, middle days of
          // multi-day spans). They paint as background; timed lanes go above.
          const full: YCalendarEvent[] = []
          const timed: YCalendarEvent[] = []
          for (const e of dayEvents) {
            if (e.allDay) { full.push(e); continue }
            const { top, bot } = spanFor(e, day)
            if (top === 0 && bot >= 1439) full.push(e)
            else timed.push(e)
          }
          const lanes = assignLanes(timed, day)
          const nowFrac = sameDay(day, now) ? (now.getHours() * 60 + now.getMinutes()) / 1440 : null
          // While this column holds the focused event it grows past its width —
          // let it (and a pending-create's buttons) spill instead of clipping.
          const holdsFocus = timed.some((e) => e.id === edit.focusId)
          const holdsPending = pending?.dayIdx === dayIdx

          return (
            <div
              key={day.getTime()}
              onPointerDown={(e) => startDrag(e, dayIdx)}
              style={{
                flex: 1,
                position: 'relative',
                minWidth: 0,
                borderRight: dayIdx < 6 ? '1px solid var(--border, #d4cfc9)' : undefined,
                cursor: interactive ? 'crosshair' : 'default',
                touchAction: 'none',
                overflow: holdsFocus || holdsPending ? 'visible' : 'hidden',
                zIndex: holdsFocus || holdsPending ? 3 : undefined,
              }}
            >
              {/* Full-day colour slices */}
              {full.map((e, i) => (
                <div
                  key={e.id}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => onEventClick?.(e)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${(i / full.length) * 100}%`,
                    width: `${(1 / full.length) * 100}%`,
                    background: colorOf(e),
                    opacity: 0.85,
                    color: '#fff',
                    padding: '4px 2px',
                    fontSize: 9,
                    fontWeight: 600,
                    textAlign: 'center',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    zIndex: 1,
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  {e.blocks && e.blocks.length > 0 && (
                    <div style={{ marginTop: 4, textAlign: 'left' }}>
                      <BlockList compact blocks={e.blocks} onToggle={(bid, ck) => onToggleBlock?.(e.id, bid, ck)} />
                    </div>
                  )}
                </div>
              ))}

              {/* Draft preview during a drag */}
              {draft && draft.dayIdx === dayIdx && (() => {
                const lo = Math.min(draft.aMin, draft.bMin)
                const hi = Math.max(draft.aMin, draft.bMin)
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: pct(lo),
                      height: pct(Math.max(hi - lo, SNAP)),
                      left: 1,
                      right: 1,
                      background: 'color-mix(in srgb, var(--accent, #b5936a) 35%, transparent)',
                      border: '1px solid var(--accent, #b5936a)',
                      borderRadius: 4,
                      zIndex: 4,
                      pointerEvents: 'none',
                      fontSize: 9,
                      padding: '1px 3px',
                      color: 'var(--fg, #1a1a1a)',
                    }}
                  >
                    {fmt(lo)}–{fmt(hi)}
                  </div>
                )
              })()}

              {/* Staged create — the block sits with a confirm/cancel pill until
                  the user commits it. Tapping elsewhere discards it. */}
              {holdsPending && pending && (() => {
                const { lo, hi } = pending
                return (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        top: pct(lo),
                        height: pct(Math.max(hi - lo, SNAP)),
                        left: 1,
                        right: 1,
                        background: 'color-mix(in srgb, var(--accent, #b5936a) 30%, transparent)',
                        border: '1px dashed var(--accent, #b5936a)',
                        borderRadius: 4,
                        zIndex: 4,
                        pointerEvents: 'none',
                        fontSize: 9,
                        padding: '1px 3px',
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
                        gap: 6,
                        zIndex: 10,
                      }}
                    >
                      <button onClick={confirmPending} title="Crear" style={pendingBtn(true)}>✓</button>
                      <button onClick={() => setPending(null)} title="Cancelar" style={pendingBtn(false)}>✕</button>
                    </div>
                  </>
                )
              })()}

              {/* Timed segments */}
              {timed.map((e) => {
                const { top, bot } = spanFor(e, day)
                const l = lanes.get(e.id) ?? { lane: 0, lanes: 1 }
                const showBlocks = !!e.blocks?.length && bot - top >= BLOCKS_MIN_SPAN
                const focused = edit.focusId === e.id && edit.canEdit(e)
                // Focused → grow the box in real px (font/radius unchanged);
                // drop back while dragging so the geometry reads true.
                const zoomed = focused && !edit.preview
                const px = zoomed ? ZOOM_PAD.x : 0
                const py = zoomed ? ZOOM_PAD.y : 0
                return (
                  <div
                    key={e.id}
                    onPointerDown={(ev) => {
                      ev.stopPropagation()
                      if (!gridRef.current) return
                      const rect = gridRef.current.getBoundingClientRect()
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
                      left: `calc(${(l.lane / l.lanes) * 100}% + 1px - ${px}px)`,
                      width: `calc(${(1 / l.lanes) * 100}% - 3px + ${px * 2}px)`,
                      background: colorOf(e),
                      color: '#fff',
                      borderRadius: 4,
                      padding: '1px 3px',
                      fontSize: 10,
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      cursor: focused ? 'grab' : 'pointer',
                      touchAction: 'none',
                      zIndex: focused ? 8 : 2,
                      boxShadow: focused ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.15)',
                      transition: 'top 0.15s ease, height 0.15s ease, left 0.15s ease, width 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{e.title}</div>
                    {showBlocks && (
                      <BlockList compact blocks={e.blocks!} onToggle={(bid, ck) => onToggleBlock?.(e.id, bid, ck)} />
                    )}
                  </div>
                )
              })}

              {/* Focus overlay — ring + resize handles over the focused event's segment */}
              {(() => {
                const fe = timed.find((e) => e.id === edit.focusId)
                if (!fe || !edit.canEdit(fe)) return null
                const { top, bot } = spanFor(fe, day)
                const l = lanes.get(fe.id) ?? { lane: 0, lanes: 1 }
                const px = !edit.preview ? ZOOM_PAD.x : 0
                const py = !edit.preview ? ZOOM_PAD.y : 0
                const grab = (ev: React.PointerEvent, mode: 'start' | 'end') => {
                  if (gridRef.current) edit.beginEdit(ev, fe, mode, gridRef.current.getBoundingClientRect(), day)
                }
                const handle: React.CSSProperties = {
                  position: 'absolute',
                  left: '50%',
                  width: 14,
                  height: 14,
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
                      left: `calc(${(l.lane / l.lanes) * 100}% + 1px - ${px}px)`,
                      width: `calc(${(1 / l.lanes) * 100}% - 3px + ${px * 2}px)`,
                      border: '2px solid var(--fg, #1a1a1a)',
                      borderRadius: 4,
                      zIndex: 9,
                      pointerEvents: 'none',
                      // Track the grown event: same geometry, same px growth.
                      transition: 'top 0.15s ease, height 0.15s ease, left 0.15s ease, width 0.15s ease',
                    }}
                  >
                    <div onPointerDown={(ev) => grab(ev, 'start')} style={{ ...handle, top: -7, transform: 'translateX(-50%)' }} />
                    <div onPointerDown={(ev) => grab(ev, 'end')} style={{ ...handle, bottom: -7, transform: 'translateX(-50%)' }} />
                    {edit.preview && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          transform: 'translateY(-100%)',
                          background: 'var(--fg, #1a1a1a)',
                          color: 'var(--bg-elevated, #fff)',
                          fontSize: 9,
                          padding: '1px 4px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          zIndex: 7,
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
                <div style={{ position: 'absolute', top: `${nowFrac * 100}%`, left: 0, right: 0, height: 0, borderTop: '2px solid var(--danger, #e5484d)', zIndex: 5, pointerEvents: 'none' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
