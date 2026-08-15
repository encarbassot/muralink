import type { YPhone, YEmail, YDateTime, YAddress, YGeoPoint, YVisibility } from '@muralink/types'

// A contact. Only `id`, `name` and `createdAt` are required — every other
// field is optional so external platforms (a CRM, an ERP, a Rails app) can map
// their own records onto it with whatever subset they have. Platform-specific
// data that has no field here goes in `custom`.
export interface YContact {
  id: string
  name: string
  phone?: YPhone
  email?: YEmail
  notes?: string
  // Durable profile of the contact. Unlike `notes` (the user's scratchpad,
  // never touched by AI), `description` is the field the chat assistant reads
  // and proposes updates to when it learns lasting facts about the contact.
  description?: string
  company?: string
  tags?: string[]
  avatarUrl?: string
  address?: string
  // Structured place, set by clicking the embedded map (LocationSection). Distinct
  // from `address` (freeform display string, kept for back-compat/manual entry).
  location?: YAddress
  // This contact's own muralink account, once linked — lets us poll their
  // published public locations. Populated by pasting an invitation link the
  // account owner generated (see modules/contacts/implementations/web/locationSync.ts).
  linkedAccount?: {
    tunnelUrl: string
    status: 'pending' | 'accepted' | 'revoked'
    lastSyncedAt?: string
  }
  // Provenance, for contacts that live in an external system (adapter spaces):
  // the id in that system and a short source label like 'bikehunter'.
  externalId?: string
  source?: string
  // Escape hatch for platform-specific fields the UI shows as key → value.
  custom?: Record<string, string | number | boolean>
  createdAt: YDateTime
  updatedAt?: string
  // Which storage space currently holds this contact (runtime-only, stamped
  // on read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}

// The always-saved draft message for a contact — a persistent workspace the
// user (and the chat AI, which may write it freely) keeps editing until it's
// sent through some channel. One per contact, deterministic id `prep-<contactId>`
// so lookup is O(1) without an index. Will grow `subject?`/`channel?` when the
// mail module can send (a draft is message-shaped — that's why this is its own
// collection and not a field on YContact).
export interface YPreparedMessage {
  id: string
  contactId: string
  body: string
  updatedAt: string
  spaceId?: string
}

/** Deterministic prepared-message id for a contact. */
export const preparedMessageId = (contactId: string): string => `prep-${contactId}`

// Relation roles linking a contact to its to-do reminders (edges live in the
// 'relations' collection: contact --role--> reminder). Private vs shared is
// encoded in the ROLE — a first-class SpaceQuery filter — so the future
// tunnel-based sync can select shared todos with an existing query param.
// Both lists are local-only today; contacts are plain fichas (no user_id yet).
export const CONTACT_TODO_PRIVATE = 'todo-private'
export const CONTACT_TODO_SHARED = 'todo-shared'
export type ContactTodoRole = typeof CONTACT_TODO_PRIVATE | typeof CONTACT_TODO_SHARED

// A location window published by MY OWN muralink account (managed in
// MyLocationsPanel), gated by `visibility` — evaluated with @muralink/types'
// `canView`. NOT a YCalendarEvent: no title/blocks/facets/rrule relevance,
// mapped to one only at the UI boundary (see toCalendarEvents.ts) for display
// in an embedded CalendarApp year view.
export interface YContactLocation {
  id: string
  label?: string
  point: YGeoPoint
  address?: string
  startAt: YDateTime
  // Open-ended (no end) = "currently here".
  endAt?: YDateTime
  visibility: YVisibility
  trustGroupId?: string
  createdAt: string
  updatedAt?: string
}

// Local cache of a linked contact's last successful poll (locationSync.ts).
// One entry per contact — `id` is always `contactId` (deterministic, O(1) lookup).
export interface YContactLocationCache {
  id: string
  contactId: string
  locations: YContactLocation[]
  fetchedAt: string
}
