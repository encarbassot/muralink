// A read-only calendar space that projects time entries as events. Registered
// by the host into the 'events' collection (composition root wiring) — the
// calendar keeps zero knowledge of the tracker; it just merges one more space.
// Model (time entries) and view (calendar) stay decoupled.

import { listMerged } from '@muralink/spaces'
import type { SpaceQuery, StorageSpace } from '@muralink/spaces'
import type { YTimerDef, YTimeEntry } from '../../types.ts'
import { entryToEvent, overlapsRange, type TrackerCalendarEvent } from '../../time.ts'
import { ENTRIES_COLLECTION, TIMERS_COLLECTION, useTracker } from './trackerStore.ts'

export const TRACKER_EVENTS_SPACE = 'tracker'

export function makeTrackerEventsSpace(): StorageSpace<TrackerCalendarEvent> {
  return {
    id: TRACKER_EVENTS_SPACE,
    label: 'Cronómetros',
    local: true,
    readonly: true,

    async list(query?: SpaceQuery): Promise<TrackerCalendarEvent[]> {
      // Read through the same spaces the tracker store is configured with, so
      // the projection follows the user's storage choice (local / orchester).
      const active = useTracker.getState().activeSpaces
      const [entries, timers] = await Promise.all([
        listMerged<YTimeEntry>(ENTRIES_COLLECTION, active, query),
        listMerged<YTimerDef>(TIMERS_COLLECTION, active),
      ])
      const now = new Date()
      const nowMs = now.getTime()
      const byId = new Map(timers.map((t) => [t.id, t]))
      return entries
        .filter((e) => overlapsRange(e, query?.from, query?.to, nowMs))
        .map((e) => entryToEvent(e, byId.get(e.timerId), now))
    },

    // Read-only projection: the calendar can look, not touch. Silent no-ops
    // (not throws) so a stray edit can never blank the calendar.
    async create(item) {
      return item
    },
    async update() {
      return undefined
    },
    async remove() {
      return undefined
    },
  }
}
