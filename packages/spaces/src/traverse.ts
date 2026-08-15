// Traversal over the relation graph. Two concerns, deliberately split:
//   - The ASSOCIATIVE graph (owner, host, attendee, …) may contain cycles —
//     real data does (A knows B, B knows A). We never forbid them; we only guard
//     *traversal* with a visited-set + depth cap that soft-stops on revisit.
//   - CONTAINMENT relations (contains / child-of / parent-of) must stay acyclic,
//     mirroring the module DAG. Those are guarded on WRITE with a hard throw.
//
// Mirrors packages/core/src/dag.ts (CycleError / topologicalOrder) but lives in
// the data layer — core stays module-DAG only per CLAUDE.md.

import type { Instance, InstanceRef, Relation } from '@muralink/types'
import { isContainmentRole } from '@muralink/types'

export class ContainmentCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Containment cycle: ${cycle.join(' -> ')}`)
    this.name = 'ContainmentCycleError'
  }
}

/** A resolved node in an instance tree. `children` may be truncated when a cycle
 *  or the depth cap was hit — `truncated` says which, so a UI can show a chip. */
export interface InstanceNode {
  ref: InstanceRef
  instance?: Instance // undefined = dangling (endpoint in another, unavailable space)
  children: InstanceNode[]
  truncated?: 'cycle' | 'depth'
}

/** Would adding `edge` (a containment relation) close a cycle in the containment
 *  subgraph? Throws `ContainmentCycleError` if so. No-op for associative roles. */
export function assertNoContainmentCycle(existing: Relation[], edge: Relation): void {
  if (!isContainmentRole(edge.role)) return

  // Build parent→child adjacency over containment edges, including the new one.
  const adj = new Map<string, string[]>()
  const add = (from: string, to: string) => {
    const list = adj.get(from) ?? []
    list.push(to)
    adj.set(from, list)
  }
  for (const r of existing) if (isContainmentRole(r.role)) add(r.fromId, r.toId)
  add(edge.fromId, edge.toId)

  // A cycle exists iff, following children, we can travel from edge.toId back to
  // edge.fromId. DFS with a path trace for a useful error.
  const path: string[] = []
  const visiting = new Set<string>()
  const dfs = (id: string): boolean => {
    if (id === edge.fromId && path.length > 0) {
      path.push(id)
      return true
    }
    if (visiting.has(id)) return false
    visiting.add(id)
    path.push(id)
    for (const next of adj.get(id) ?? []) if (dfs(next)) return true
    path.pop()
    return false
  }
  if (dfs(edge.toId)) throw new ContainmentCycleError(path)
}

/** Resolve an instance and its children into a tree, following the given roles
 *  (default: containment roles). Cycle-safe: a revisited node soft-stops with
 *  `truncated: 'cycle'`; `maxDepth` caps runaway depth with `truncated: 'depth'`. */
export function resolveTree(
  root: InstanceRef,
  relations: Relation[],
  load: (ref: InstanceRef) => Instance | undefined,
  opts?: { maxDepth?: number; roles?: string[] },
): InstanceNode {
  const maxDepth = opts?.maxDepth ?? 32
  const roles = opts?.roles
  const childrenOf = (id: string): InstanceRef[] =>
    relations
      .filter((r) => r.fromId === id && (roles ? roles.includes(r.role) : isContainmentRole(r.role)))
      .map((r) => ({ type: r.toType, id: r.toId }))

  const build = (ref: InstanceRef, depth: number, seen: Set<string>): InstanceNode => {
    const node: InstanceNode = { ref, instance: load(ref), children: [] }
    if (seen.has(ref.id)) return { ...node, truncated: 'cycle' }
    if (depth >= maxDepth) return { ...node, truncated: 'depth' }
    const nextSeen = new Set(seen).add(ref.id)
    node.children = childrenOf(ref.id).map((c) => build(c, depth + 1, nextSeen))
    return node
  }

  return build(root, 0, new Set())
}
