// A typed, DIRECTIONAL link between any two instances: `from --role--> to`.
// This is the edge layer over the instance graph. A contact-as-host of an event,
// a contact-as-owner of a product, a stack-stored-in a location — all Relations.
// A→B and B→A are distinct rows with distinct roles (host-of vs hosted-by), so
// the same pair can carry many independent relations.
//
// Zero dependencies. Both types satisfy the spaces layer's `SpaceEntity`, so they
// store and sync through the same three backends (idb / http / tunnel) as any
// other collection — relations are just another spaced collection.
/** Canonical id for a relation-type map entry. */
export const relationTypeId = (fromType, toType, role) => `${fromType}|${toType}|${role}`;
/** Roles that build a containment hierarchy (parent→child). Only these are
 *  guarded against cycles on write; all other (associative) relations may form
 *  cycles freely. Kept here so both the spaces guard and UI agree on the set. */
export const CONTAINMENT_ROLES = ['contains', 'child-of', 'parent-of'];
export const isContainmentRole = (role) => CONTAINMENT_ROLES.includes(role);
