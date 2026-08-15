import type { YBlock, YDateTime, YDuration, YFacet, YMoney } from '@muralink/types'

export interface YCalendarEvent {
  id: string
  title: string
  start: YDateTime
  end: YDateTime
  duration: YDuration
  allDay: boolean
  // Recurrence as an RFC 5545 RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY
  // (+ INTERVAL, UNTIL, COUNT). Occurrences are expanded virtually at render
  // time (see recurrence.ts) — never materialized.
  rrule?: string
  // Content blocks — legacy MIRROR of `facets`: every save flattens the facet
  // blocks back here so inline span rendering and the Google sync mapping keep
  // reading `blocks` unchanged. When `facets` is present it is canonical; a
  // record carrying only `blocks` (old client) reads as one implicit facet.
  blocks?: YBlock[]
  // Typed sections of this instance (todo lists, notes, …). Canonical content
  // model; see `blocks` for the compatibility mirror.
  facets?: YFacet[]
  metadata?: Record<string, string>
  updatedAt?: string
  // Google Calendar sync mapping (server-populated, single direction: only the
  // sync engine writes these — clients never set them and frontends ignore
  // them, like spaceId). Present only on orchester-held events that sync.
  googleId?: string
  googleEtag?: string
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

// ─── Appointments ─────────────────────────────────────────────────────────
// Booking on top of the calendar: services (what can be booked) and the
// appointments themselves (a contact booked into a service at a time). Folded
// in from the former standalone appointments module — a calendar view, not its
// own module.

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no-show'

export interface YService {
  id: string
  name: string
  durationSeconds: number
  price?: YMoney
  description?: string
}

export interface YAppointment {
  id: string
  contactId: string
  serviceId: string
  start: YDateTime
  duration: YDuration
  status: AppointmentStatus
  notes?: string
  createdAt: YDateTime
}

export interface YAvailableSlot {
  start: YDateTime
  durationSeconds: number
}
