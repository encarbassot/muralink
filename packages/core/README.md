# @muralink/core

Layer 1 — the module runtime. Contracts and the in-memory registry every
platform mounts modules into. No UI, no React, no Express.

## What lives here

- **`ModuleRegistry`** ([src/ModuleRegistry.ts](src/ModuleRegistry.ts)) —
  `register` / `resolve` / `getViewsForPlatform` / `getDependencyGraph`.
  A `Map<id, manifest>` plus lookup helpers. Pure and offline.
- **`DAG`** ([src/dag.ts](src/dag.ts)) — dependency graph over manifests with
  `topologicalOrder()`, `validate()`, cycle + missing-dependency detection.
- **`ViewRenderer`** ([src/ViewRenderer.ts](src/ViewRenderer.ts)) — the
  `render(spec, size, context)` interface. Each platform implements it; core
  only declares it.

## Rules

- Depends only on `@muralink/types`.
- No platform code, no rendering — a platform decides where and how a `ViewSpec`
  is drawn. Core just answers "which views, in what dependency order".
- The graph is a DAG. No circular module dependencies — extract a primitive
  type instead.

## Usage sketch

```ts
import { ModuleRegistry } from '@muralink/core'
import { manifest as url } from '@muralink/module-url'

const registry = new ModuleRegistry()
registry.register(url)
registry.getDependencyGraph().validate() // throws on cycle / missing dep
const views = registry.getViewsForPlatform('web')
```
