// The relation layer as spaced collections. Relations (typed directional edges
// between instances) and the relation-type map both store and sync through the
// same three backends as any other collection — nothing bespoke. This file wires
// the collections and exposes the discovery/query helpers the UI needs.
//
// Two collections:
//   'relations'      → Relation rows (the edges)
//   'relationTypes'  → RelationType rows (the discoverable A→B vocabulary)

import type { InstanceRef, InstanceType, Relation, RelationType } from '@muralink/types'
import { relationTypeId } from '@muralink/types'
import type { SpaceQuery } from './space'
import { listSpaces } from './registry'

export const RELATIONS = 'relations'
export const RELATION_TYPES = 'relationTypes'

/** In-memory filter for the idb space's `match` hook — mirrors the URL-param
 *  filtering the http space does server-side, so both backends agree. */
export function matchRelation(r: Relation, q: SpaceQuery): boolean {
  if (q.ids && !q.ids.includes(r.id)) return false
  if (q.fromId && r.fromId !== q.fromId) return false
  if (q.toId && r.toId !== q.toId) return false
  if (q.fromType && r.fromType !== q.fromType) return false
  if (q.toType && r.toType !== q.toType) return false
  if (q.role && r.role !== q.role) return false
  return true
}

export function matchRelationType(t: RelationType, q: SpaceQuery): boolean {
  if (q.ids && !q.ids.includes(t.id)) return false
  if (q.fromType && t.fromType !== q.fromType) return false
  if (q.toType && t.toType !== q.toType) return false
  if (q.role && t.role !== q.role) return false
  return true
}

/** Serialize relational filters to URL params for the http space's `toParams`. */
export function relationToParams(q: SpaceQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (q.fromId) p.set('fromId', q.fromId)
  if (q.toId) p.set('toId', q.toId)
  if (q.fromType) p.set('fromType', q.fromType)
  if (q.toType) p.set('toType', q.toType)
  if (q.role) p.set('role', q.role)
  if (q.ids) p.set('ids', q.ids.join(','))
  if (q.limit) p.set('limit', String(q.limit))
  return p
}

async function listAll<T>(collection: string, query: SpaceQuery): Promise<T[]> {
  const spaces = listSpaces<T & { id: string }>(collection)
  const results = await Promise.allSettled(spaces.map((s) => s.list(query)))
  const out: T[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue // per-space failure isolation, like listMerged
    for (const it of r.value) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      out.push(it as T)
    }
  }
  return out
}

/** Every relation touching an instance, from either end. Includes a synthesized
 *  inverse view for edges that point AT the ref, so callers see one uniform list
 *  of "relations of X" regardless of stored direction. */
export async function listRelationsFor(
  ref: InstanceRef,
): Promise<Array<Relation & { inverse: boolean }>> {
  const [outgoing, incoming] = await Promise.all([
    listAll<Relation>(RELATIONS, { fromId: ref.id, fromType: ref.type }),
    listAll<Relation>(RELATIONS, { toId: ref.id, toType: ref.type }),
  ])
  return [
    ...outgoing.map((r) => ({ ...r, inverse: false })),
    ...incoming.map((r) => ({ ...r, inverse: true })),
  ]
}

/** The discovery set: relation types previously used from type A to type B.
 *  A→B and B→A are distinct because the map is keyed on the ordered pair. */
export async function relationTypesBetween(
  fromType: InstanceType,
  toType: InstanceType,
): Promise<RelationType[]> {
  const types = await listAll<RelationType>(RELATION_TYPES, { fromType, toType })
  return types.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
}

/** Upsert a relation type into the map and bump its usage. Free-text creation
 *  from the picker lands here; the next `relationTypesBetween` surfaces it. */
export function newRelationType(
  fromType: InstanceType,
  toType: InstanceType,
  role: string,
  label?: string,
  inverseRole?: string,
): RelationType {
  return {
    id: relationTypeId(fromType, toType, role),
    fromType,
    toType,
    role,
    label,
    inverseRole,
    usageCount: 1,
  }
}
