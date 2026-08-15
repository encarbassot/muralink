// Dependency graph + recompute order. Mirrors the topological approach of
// packages/core/src/dag.ts, but instead of throwing on a cycle it identifies the
// cyclic (and cycle-downstream) cells so the engine can POISON them with a
// #CYCLE value — one circular reference must never blank the whole sheet.

export class CalcCycleError extends Error {
  constructor(public readonly cells: string[]) {
    super(`Circular cell dependency involving: ${cells.join(', ')}`)
    this.name = 'CalcCycleError'
  }
}

export interface TopoResult {
  /** Cells in a safe evaluation order (precedents before dependents). */
  order: string[]
  /** Cells that are in a cycle or downstream of one — cannot be evaluated. */
  cyclic: Set<string>
}

/**
 * Kahn topological sort over precedents→dependents edges.
 * @param precedents cellId → the set of cells it directly references.
 * Only cells present as keys are ordered; referenced-but-absent cells are
 * treated as blank leaves (they simply have no outgoing contribution).
 */
export function topoOrder(precedents: Map<string, Set<string>>): TopoResult {
  const nodes = [...precedents.keys()]

  // in-degree = number of precedents that are themselves cells in the sheet.
  const indeg = new Map<string, number>()
  const dependents = new Map<string, string[]>() // precedent → cells depending on it
  for (const id of nodes) {
    indeg.set(id, 0)
  }
  for (const id of nodes) {
    for (const dep of precedents.get(id)!) {
      if (!precedents.has(dep)) continue // absent leaf — not a constraint
      indeg.set(id, (indeg.get(id) ?? 0) + 1)
      const list = dependents.get(dep) ?? []
      list.push(id)
      dependents.set(dep, list)
    }
  }

  // Deterministic queue order: sort so recompute is reproducible run-to-run.
  const queue = nodes.filter((id) => (indeg.get(id) ?? 0) === 0).sort()
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    const deps = dependents.get(id) ?? []
    for (const d of [...deps].sort()) {
      const next = (indeg.get(d) ?? 0) - 1
      indeg.set(d, next)
      if (next === 0) queue.push(d)
    }
  }

  // Anything not emitted is in — or downstream of — a cycle.
  const cyclic = new Set<string>()
  if (order.length !== nodes.length) {
    const emitted = new Set(order)
    for (const id of nodes) if (!emitted.has(id)) cyclic.add(id)
  }
  return { order, cyclic }
}
