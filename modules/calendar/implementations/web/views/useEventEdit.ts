// Focus + drag-edit state shared by DayColumn and WeekViewMobile. First tap
// on an event focuses it (handles appear); tapping the focused event opens the
// editor. While focused: dragging the body moves the whole block (duration
// kept), dragging a handle moves just that edge. If the edges cross, start and
// end swap. Occurrence ids (`base::iso`) are virtual — they can't be edited in
// place, so they never focus.

import { useEffect, useRef, useState } from 'react'
import type { YCalendarEvent } from '../../../types.ts'
import { isOccurrenceId } from '../../../recurrence.ts'
import { SNAP, atMinute, minuteFromPointer } from './timeGrid.ts'

export type EditMode = 'move' | 'start' | 'end'

// Hold this long on an event (finger still) to pick it up without focusing
// first — the mobile "long-press to drag" gesture.
const LONG_PRESS_MS = 320

export interface EditPreview { id: string; start: Date; end: Date }

interface DragCtx {
  ev: YCalendarEvent
  mode: EditMode
  rect: DOMRect // vertical geometry of the day grid (any column — they share it)
  day: Date // day of the column where the drag started
  grabMin: number
  s0: Date
  e0: Date
}

export function useEventEdit(opts: {
  onUpdate?: (ev: YCalendarEvent, start: Date, end: Date) => void
  // Week view: resolve the day under the pointer so a body-drag can cross columns.
  dayFromX?: (clientX: number) => Date | null
  // Focus can be owned by the host (so a non-modal detail card can clear it).
  // When focusId is passed the hook is controlled; otherwise it keeps its own.
  focusId?: string | null
  onFocusChange?: (id: string | null) => void
}) {
  const { onUpdate, dayFromX } = opts
  const [internalFocus, setInternalFocus] = useState<string | null>(null)
  const controlled = opts.focusId !== undefined
  const focusId = controlled ? opts.focusId! : internalFocus
  const setFocusId = (id: string | null) => {
    if (!controlled) setInternalFocus(id)
    opts.onFocusChange?.(id)
  }
  const [preview, setPreview] = useState<EditPreview | null>(null)
  const drag = useRef<DragCtx | null>(null)
  const moved = useRef(false)
  // True from a long-press pickup until the next gesture — so the click that
  // ends the press doesn't also open the editor.
  const picked = useRef(false)

  const canEdit = (e: YCalendarEvent) => !!onUpdate && !isOccurrenceId(e.id)

  function compute(e: PointerEvent | React.PointerEvent): { start: Date; end: Date } | null {
    const d = drag.current
    if (!d) return null
    const m = minuteFromPointer(e.clientY, d.rect)
    if (d.mode === 'move') {
      const day = dayFromX?.(e.clientX) || d.day
      const deltaMs = (m - d.grabMin) * 60000 + (atMinute(day, 0).getTime() - atMinute(d.day, 0).getTime())
      return { start: new Date(d.s0.getTime() + deltaMs), end: new Date(d.e0.getTime() + deltaMs) }
    }
    const edge = atMinute(d.day, m)
    let start = d.mode === 'start' ? edge : d.s0
    let end = d.mode === 'end' ? edge : d.e0
    if (start > end) [start, end] = [end, start] // crossed edges swap roles
    if (end.getTime() - start.getTime() < SNAP * 60000) end = new Date(start.getTime() + SNAP * 60000)
    return { start, end }
  }

  useEffect(() => {
    if (!preview) return
    function onMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      moved.current = true
      const r = compute(e)
      if (r) setPreview({ id: d.ev.id, ...r })
    }
    function onUp(e: PointerEvent) {
      const d = drag.current
      if (d && moved.current) {
        const r = compute(e)
        if (r) onUpdate?.(d.ev, r.start, r.end)
      }
      drag.current = null
      setPreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [preview, onUpdate])

  // Core of a drag — arm the gesture from a raw pointer y (no React event, so
  // a long-press timer can call it too). The window listeners above take over.
  function startDrag(ev: YCalendarEvent, mode: EditMode, rect: DOMRect, day: Date, clientY: number) {
    if (!canEdit(ev)) return
    const s0 = new Date(ev.start.iso)
    const e0 = new Date(ev.end.iso)
    drag.current = { ev, mode, rect, day, grabMin: minuteFromPointer(clientY, rect), s0, e0 }
    moved.current = false
    setPreview({ id: ev.id, start: s0, end: e0 })
  }

  function beginEdit(e: React.PointerEvent, ev: YCalendarEvent, mode: EditMode, rect: DOMRect, day: Date) {
    if (!canEdit(ev) || e.button !== 0) return
    e.stopPropagation()
    picked.current = false
    startDrag(ev, mode, rect, day, e.clientY)
  }

  // Long-press an event to pick it up straight away — no focus-first step.
  // The press aborts if the finger moves (a scroll/tap) or lifts early.
  function pressEvent(e: React.PointerEvent, ev: YCalendarEvent, rect: DOMRect, day: Date) {
    if (!canEdit(ev) || e.button !== 0) return
    picked.current = false
    const x0 = e.clientX
    const y0 = e.clientY
    let done = false
    function cleanup() {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointermove', onMove)
    }
    function onMove(pe: PointerEvent) {
      if (Math.abs(pe.clientX - x0) > 8 || Math.abs(pe.clientY - y0) > 8) cleanup()
    }
    const timer = window.setTimeout(() => {
      cleanup()
      setFocusId(ev.id)
      startDrag(ev, 'move', rect, day, y0)
      picked.current = true // released without moving → stay picked, don't open
    }, LONG_PRESS_MS)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointermove', onMove)
  }

  // True right after a drag — lets onClick skip the focus/edit toggle that
  // would otherwise fire from the same pointer release.
  const wasDrag = () => moved.current || picked.current

  // Substitute the previewed dates so spanFor/lanes/day-filtering all follow
  // the drag live, including across midnight or into another column.
  function withPreview(events: YCalendarEvent[]): YCalendarEvent[] {
    if (!preview) return events
    return events.map((e) =>
      e.id === preview.id
        ? { ...e, start: { ...e.start, iso: preview.start.toISOString() }, end: { ...e.end, iso: preview.end.toISOString() } }
        : e,
    )
  }

  return { focusId, setFocusId, preview, beginEdit, pressEvent, wasDrag, canEdit, withPreview }
}
