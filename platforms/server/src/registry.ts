import { ModuleRegistry } from '@muralink/core'
import type { ModuleManifest } from '@muralink/types'
import { getDb } from './db.ts'
import { CATALOG, catalogEntry } from './modules/catalog.ts'
import { installedIds } from './modules/index.ts'

// The registry holds what this instance RUNS, which is the installed subset of
// what this build SHIPS (modules/catalog.ts). Installing a module rebuilds it —
// see rebuildRegistry(), wired to the /api/modules router in index.ts.

let registry: ModuleRegistry | null = null

/** Installed modules, in dependency order, with any module whose dependencies
 *  are not installed dropped.
 *
 *  Pruning rather than throwing is deliberate: an unsatisfied dep can only come
 *  from a hand-edited db or a build that dropped a module, and a self-hosted box
 *  must still boot — degraded and loud beats dead. The install path itself
 *  refuses to create this state. */
function installedManifests(): ModuleManifest[] {
  const installed = installedIds(getDb())
  const active = new Map<string, ModuleManifest>()
  for (const entry of CATALOG) {
    if (installed.has(entry.manifest.id)) active.set(entry.manifest.id, entry.manifest)
  }

  // Fixpoint: dropping a module can orphan its dependents, so repeat until stable.
  for (;;) {
    const orphaned = [...active.values()].filter((m) =>
      m.dependencies.some((dep) => !active.has(dep)),
    )
    if (orphaned.length === 0) break
    for (const m of orphaned) {
      const missing = m.dependencies.filter((dep) => !active.has(dep))
      console.warn(
        `Module "${m.id}" is installed but its dependencies are not (${missing.join(', ')}) — not mounting it.`,
      )
      active.delete(m.id)
    }
  }

  return [...active.values()]
}

function build(manifests: ModuleManifest[]): ModuleRegistry {
  const next = new ModuleRegistry()
  for (const manifest of manifests) next.register(manifest)
  // Validate DAG — will throw CycleError or MissingDependencyError if broken
  next.getDependencyGraph().validate()
  return next
}

/** The registry for this instance. Built from the installed set on first call.
 *  Pass manifests explicitly to bypass the install state (tests, embedders). */
export function getRegistry(manifests?: ModuleManifest[]): ModuleRegistry {
  if (registry) return registry
  registry = build(manifests ?? installedManifests())
  return registry
}

/** Rebuild after an install/uninstall so the running process reflects it
 *  without a restart. Returns the new registry. */
export function rebuildRegistry(): ModuleRegistry {
  registry = build(installedManifests())
  console.log(`ModuleRegistry: ${registry.all().map((m) => m.id).join(', ')}`)
  return registry
}

/** Catalog metadata for a module id — label, category, api prefixes. */
export { catalogEntry }
