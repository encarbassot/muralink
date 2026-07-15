// @muralink/core — the module runtime contracts. ModuleRegistry + dependency
// graph + the ViewRenderer interface. No UI, no React.

export { ModuleRegistry, UnknownModuleError, DuplicateModuleError } from './ModuleRegistry.js'
export { DAG, CycleError, MissingDependencyError } from './dag.js'
export type { ViewRenderer } from './ViewRenderer.js'
