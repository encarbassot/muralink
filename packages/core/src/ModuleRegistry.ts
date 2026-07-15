// The runtime each platform uses to mount modules. In-memory, pure, offline.
// Dependencies resolve from static manifests — never from a remote server.

import type { ModuleManifest, Platform, ViewSpec } from '@muralink/types'
import { DAG } from './dag.js'

export class UnknownModuleError extends Error {
  constructor(public readonly moduleId: string) {
    super(`No module registered with id "${moduleId}"`)
    this.name = 'UnknownModuleError'
  }
}

export class DuplicateModuleError extends Error {
  constructor(public readonly moduleId: string) {
    super(`Module "${moduleId}" is already registered`)
    this.name = 'DuplicateModuleError'
  }
}

/** Holds the locally installed modules and answers questions about them. */
export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleManifest>()

  /** Add a module. Throws on a duplicate id. */
  register(manifest: ModuleManifest): void {
    if (this.modules.has(manifest.id)) {
      throw new DuplicateModuleError(manifest.id)
    }
    this.modules.set(manifest.id, manifest)
  }

  /** Get a module by id. Throws if not registered. */
  resolve(moduleId: string): ModuleManifest {
    const found = this.modules.get(moduleId)
    if (!found) throw new UnknownModuleError(moduleId)
    return found
  }

  /** Every view across all modules that supports the given platform. */
  getViewsForPlatform(platform: Platform): ViewSpec[] {
    const views: ViewSpec[] = []
    for (const module of this.modules.values()) {
      if (!module.platforms.includes(platform)) continue
      for (const view of module.views) {
        if (view.platforms.includes(platform)) views.push(view)
      }
    }
    return views
  }

  /** The dependency graph of all registered modules. Validate it to catch
   *  missing deps or cycles before mounting. */
  getDependencyGraph(): DAG<ModuleManifest> {
    return new DAG(new Map(this.modules))
  }

  /** Convenience: all registered manifests. */
  all(): ModuleManifest[] {
    return [...this.modules.values()]
  }
}
