// Local space — IndexedDB. Works fully offline, no backend. This is the
// default storage space and is always present so the calendar renders even
// with no network and no configured API. Same DB name/store as before the
// @muralink/spaces migration, so existing events are preserved.

import { makeIdbSpace } from '@muralink/spaces'
import type { YCalendarEvent } from '../../../types.ts'
import type { StorageProvider } from './provider.ts'

// Overlap test: event is in range if it starts before `to` and ends after `from`.
// Keeps multi-day and all-day events visible on every day they touch.
export const localProvider: StorageProvider = makeIdbSpace<YCalendarEvent>({
  dbName: 'elio-calendar',
  store: 'events',
  label: 'Este dispositivo',
  match: (e, q) => (!q.to || e.start.iso < q.to) && (!q.from || e.end.iso > q.from),
})
