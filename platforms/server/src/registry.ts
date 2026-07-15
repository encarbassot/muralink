import { ModuleRegistry } from '@muralink/core'
import type { ModuleManifest } from '@muralink/types'
import { manifest as urlManifest } from '@muralink/module-url'
import { manifest as calendarManifest } from '@muralink/module-calendar'
import { manifest as contactsManifest } from '@muralink/module-contacts'
import { manifest as appointmentsManifest } from '@muralink/module-appointments'
import { manifest as stockManifest } from '@muralink/module-stock'

// Default module set — overridable by passing manifests explicitly.
// url must come first; contacts depends on it.
// Future: loaded dynamically from the module installer.
const DEFAULT_MODULES: ModuleManifest[] = [
  urlManifest,
  calendarManifest,
  contactsManifest,
  appointmentsManifest,
  stockManifest,
]

let registry: ModuleRegistry | null = null

export function getRegistry(manifests: ModuleManifest[] = DEFAULT_MODULES): ModuleRegistry {
  if (registry) return registry
  registry = new ModuleRegistry()
  for (const manifest of manifests) {
    registry.register(manifest)
  }
  // Validate DAG — will throw CycleError or MissingDependencyError if broken
  registry.getDependencyGraph().validate()
  return registry
}
