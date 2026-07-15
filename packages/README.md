# packages/

Shared, framework-agnostic foundations. Every module and platform builds on these.

- **[types/](types/)** — `@muralink/types`. Layer 0: zero-dependency primitives
  (`YUrl`, `YEmail`, …) + module contracts (`ModuleManifest`, `ViewSpec`).
- **[core/](core/)** — `@muralink/core`. Layer 1: `ModuleRegistry`, dependency `DAG`,
  the `ViewRenderer` interface. No UI.

A third package, `ui/` (truly generic components only), is planned but not yet created.
