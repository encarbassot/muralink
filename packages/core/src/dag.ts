// Dependency graph over module manifests. The module graph is a DAG —
// no circular dependencies. If you think you need a cycle, you need a new
// primitive type instead (see CLAUDE.md conventions).

import type { ModuleManifest } from '@muralink/types'

export class CycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular module dependency: ${cycle.join(' -> ')}`)
    this.name = 'CycleError'
  }
}

export class MissingDependencyError extends Error {
  constructor(
    public readonly moduleId: string,
    public readonly missing: string,
  ) {
    super(`Module "${moduleId}" depends on unregistered module "${missing}"`)
    this.name = 'MissingDependencyError'
  }
}

/** A resolved directed acyclic graph of module manifests. */
export class DAG<T extends ModuleManifest> {
  constructor(private readonly nodes: Map<string, T>) {}

  /** All manifests, in dependency order (leaf -> consumer). Throws on a cycle. */
  topologicalOrder(): T[] {
    const sorted: T[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const path: string[] = []

    const visit = (id: string): void => {
      if (visited.has(id)) return
      if (visiting.has(id)) {
        throw new CycleError([...path.slice(path.indexOf(id)), id])
      }
      const node = this.nodes.get(id)
      if (!node) return // missing deps are validated separately

      visiting.add(id)
      path.push(id)
      for (const dep of node.dependencies) visit(dep)
      path.pop()
      visiting.delete(id)
      visited.add(id)
      sorted.push(node)
    }

    for (const id of this.nodes.keys()) visit(id)
    return sorted
  }

  /** Throws if any declared dependency is not registered. */
  validate(): void {
    for (const node of this.nodes.values()) {
      for (const dep of node.dependencies) {
        if (!this.nodes.has(dep)) {
          throw new MissingDependencyError(node.id, dep)
        }
      }
    }
    this.topologicalOrder() // throws CycleError if cyclic
  }

  has(id: string): boolean {
    return this.nodes.has(id)
  }

  get(id: string): T | undefined {
    return this.nodes.get(id)
  }
}
