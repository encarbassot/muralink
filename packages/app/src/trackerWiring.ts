// Composition-root wiring between tracker, calendar and murales. The modules
// stay leaves — only the app knows all three:
//   · time entries project into the calendar's 'events' collection (read-only)
//   · play/pause refreshes any mounted calendar view
//   · new timers can attach a fresh project mural via the injected factory
// Imported for side effects at the top of registry.tsx, before any cell mounts.

import { registerSpace } from '@muralink/spaces'
import {
  makeTrackerEventsSpace,
  setMuralFactory,
  useTracker,
  TRACKER_EVENTS_SPACE,
} from '@muralink/module-tracker/web'
import { useEvents } from '@muralink/module-calendar/web'
import { useMurales } from '@muralink/module-murales/web'

// The calendar merges every active space in its 'events' collection — this one
// serves tracker sessions as read-only events.
registerSpace('events', makeTrackerEventsSpace())

// Default the projection ON exactly once. The flag (not the target list) is
// what persists the decision — a user who later hides 'Cronómetros' in the
// calendar's storage targets must not be fought on every boot.
const WIRED_FLAG = 'muralink-tracker-space-v1'
try {
  if (!localStorage.getItem(WIRED_FLAG)) {
    localStorage.setItem(WIRED_FLAG, '1')
    if (!useEvents.getState().activeTargets.includes(TRACKER_EVENTS_SPACE)) {
      useEvents.getState().toggleTarget(TRACKER_EVENTS_SPACE)
    }
  }
} catch {
  // Storage unavailable (private mode) — projection still works, just not sticky.
}

// Live refresh: a started/stopped/edited entry re-reads the calendar range so
// the session block appears without a manual reload.
useTracker.subscribe((state, prev) => {
  if (state.entries !== prev.entries) void useEvents.getState().reload()
})

// New timers get a fresh project mural by default (reassignable later).
setMuralFactory(async (title) => {
  const mural = await useMurales.getState().create({ title })
  return { id: mural.id }
})
