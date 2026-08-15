// Maps a YContactLocation (a published date-range window) onto a YCalendarEvent
// view-model, for display only in an embedded CalendarApp year view — locations
// are never stored as calendar events (see YContactLocation in types.ts).

import type { YCalendarEvent } from '@muralink/module-calendar/types'
import type { YContactLocation } from '../../types.ts'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export function locationToEvent(loc: YContactLocation): YCalendarEvent {
  const start = loc.startAt
  const end = loc.endAt ?? { iso: new Date().toISOString(), timezone: TZ }
  const seconds = Math.max(0, (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 1000)
  return {
    id: loc.id,
    title: loc.label ?? loc.address ?? '📍',
    start,
    end,
    duration: { seconds },
    allDay: true,
  }
}
