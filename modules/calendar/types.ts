import type { YDateTime, YDuration } from '@muralink/types'

export interface YCalendarEvent {
  id: string
  title: string
  start: YDateTime
  end: YDateTime
  duration: YDuration
  allDay: boolean
  metadata?: Record<string, string>
  updatedAt?: string
  // Which storage space currently holds this event. Assigned by the space on
  // read (not persisted in the payload) — 'local' | 'api' | future spaces.
  // Undefined only for events built client-side before they hit a space.
  spaceId?: string
}

export interface YAvailabilitySlot {
  start: YDateTime
  durationSeconds: number
  available: boolean
}
