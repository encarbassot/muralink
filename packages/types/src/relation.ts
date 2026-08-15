// A typed, DIRECTIONAL link between any two instances: `from --role--> to`.
// This is the edge layer over the instance graph. A contact-as-host of an event,
// a contact-as-owner of a product, a stack-stored-in a location — all Relations.
// A→B and B→A are distinct rows with distinct roles (host-of vs hosted-by), so
// the same pair can carry many independent relations.
//
// Zero dependencies. Both types satisfy the spaces layer's `SpaceEntity`, so they
// store and sync through the same three backends (idb / http / tunnel) as any
// other collection — relations are just another spaced collection.

import type { InstanceType } from './instance.js'

/** One typed directional edge between two instances. `from*`/`to*` types are
 *  denormalized onto the row so discovery and filtering need no join. */
export interface Relation {
  id: string
  role: string // the relation-type key: 'host' | 'owner' | 'stored-in' | 'attendee' | …
  fromType: InstanceType
  fromId: string
  toType: InstanceType
  toId: string
  metadata?: Record<string, string>
  createdAt?: string
  updatedAt?: string // SpaceEntity — enables last-write-wins
  spaceId?: string // SpaceEntity — runtime-only origin
}

/** One entry in the discoverable relation-type map. Keyed by the ORDERED type
 *  pair + role, so (A→B) and (B→A) are separate discoverable sets. Stored, not
 *  merely derived, so free-text additions persist and rank by usage. */
export interface RelationType {
  id: string // canonical `${fromType}|${toType}|${role}`
  fromType: InstanceType
  toType: InstanceType
  role: string // machine key
  label?: string // human: 'is host of'
  inverseRole?: string // optional declared inverse ('hosted-by') for on-the-fly mirroring
  usageCount?: number // ranks suggestions in the picker
  createdAt?: string
  updatedAt?: string // SpaceEntity
  spaceId?: string // SpaceEntity
}

/** Canonical id for a relation-type map entry. */
export const relationTypeId = (fromType: string, toType: string, role: string): string =>
  `${fromType}|${toType}|${role}`

/** Roles that build a containment hierarchy (parent→child). Only these are
 *  guarded against cycles on write; all other (associative) relations may form
 *  cycles freely. Kept here so both the spaces guard and UI agree on the set. */
export const CONTAINMENT_ROLES: readonly string[] = ['contains', 'child-of', 'parent-of']

export const isContainmentRole = (role: string): boolean => CONTAINMENT_ROLES.includes(role)
