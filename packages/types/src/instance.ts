// The universal record. Any datum in the system — a stock item, a calendar
// event, a contact, a note — is an `Instance`: a typed `data` payload plus an
// optional list of `facets` (composed content sections). This reconciles the
// two prior shapes: the facet-composition `YInstance` (facets.ts) and the
// legacy properties-bag record. A pure note has empty `data` + facets; a stock
// item has typed `data` and no facets; a calendar event can have both.
//
// Zero dependencies, like every primitive here. `spaceId` is typed `string`
// (not the spaces layer's `SpaceId`) so this package stays dependency-free —
// @muralink/spaces depends on us, never the other way round.

import type { YFacet } from './facets.js'

/** Stable, dotted type-id, namespaced by module to avoid collisions.
 *  e.g. 'stock.item', 'stock.location', 'calendar.event', 'contact', 'note', 'list'. */
export type InstanceType = string

/** Shared lifecycle state every instance can carry (from the legacy CommonState). */
export interface InstanceState {
  pinned?: boolean
  archived?: boolean
  status?: string // free per-type: 'active' | 'done' | 'draft' | …
}

/** The universal record. `data` is the humane, module-typed payload (value
 *  objects like `YEmail`/`YMoney` stay inline inside it). `facets` is the
 *  composition model. Satisfies the spaces layer's `SpaceEntity` as-is. */
export interface Instance<D = unknown> {
  id: string
  type: InstanceType
  moduleId?: string // → ModuleManifest.id; derivable from `type`, kept for convenience
  data: D // YStockItem, YCalendarEvent, YContact, {} …
  facets?: YFacet[]
  state?: InstanceState
  metadata?: Record<string, string>
  createdAt?: string
  updatedAt?: string // SpaceEntity
  spaceId?: string // SpaceEntity — runtime-only origin, stamped on read, never persisted
}

/** A lightweight pointer used inside relations and lists — never the full record. */
export interface InstanceRef {
  type: InstanceType
  id: string
}

/** An ordered collection is itself an Instance whose `data` holds member refs.
 *  This is how "InstanceList" exists without a second envelope: ordered,
 *  explicit membership a query can't express. `type` === 'list'. */
export interface InstanceListData {
  memberRefs: InstanceRef[]
  title?: string
}
export type InstanceList = Instance<InstanceListData>

// Rule of thumb — value objects vs instances:
// A value object (YEmail, YMoney, YUrl, YDateTime) has no identity and lives
// INLINE inside `data`. A datum becomes its OWN Instance the moment two records
// must reference the same one (e.g. the same email is both a contact address and
// a credential login). Start conservative; promote to Instance + Relation only on
// demonstrated cross-linking need.
