# Module spec — how to author a module

The practical guide. For the conceptual depth see
[deeplinks/types-and-modules.md](deeplinks/types-and-modules.md).

## 1. Copy the template

```
cp -r modules/_template modules/<your-id>
```

Everything except `manifest.ts` is optional — delete what you don't ship.

## 2. Write the manifest (required)

`modules/<id>/manifest.ts` exports a `ModuleManifest`:

```typescript
import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'contacts',
  version: '0.0.0',
  dependencies: ['url'],          // other module ids — must form a DAG
  types: ['YContact'],            // type ids this module exposes
  views: [
    {
      id: 'contact-card',
      platforms: ['web', 'extension'],
      sizes: ['1x1', '2x2'],
      component: './implementations/web/views/ContactCard',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}
export default manifest
```

## 3. Expose types (optional)

`modules/<id>/types.ts`, built on `@muralink/types` primitives:

```typescript
import type { YEmail, YPhone, YUrl } from '@muralink/types'

export interface YContact {
  id: string
  name: string
  email?: YEmail
  phone?: YPhone
  website?: YUrl
}
```

## 4. Add implementations (each optional)

- **web** — `implementations/web/views/[Name].[size].tsx`. React component that
  reads `ModuleContext` (storage is offline-first; `aiProvider` gates any LLM).
  Export them from `implementations/web/index.ts`.
- **server** — `implementations/server/routes.ts` returns an Express router.
- **extension** — `implementations/extension/overlay.tsx`, a shadow-DOM overlay.
- **interceptor** — one file per automatable action,
  `(page, params) => Promise<ActionResult>`. List them in
  `manifest.interceptorScripts`.

## 5. Rules

- **Capability vs implementation:** declare a platform in `manifest.platforms`
  only if you ship `implementations/<platform>/`.
- **No cycles.** If two modules need a shared shape, extract a primitive into
  `@muralink/types`.
- **Offline-first.** State 2/3 features degrade cleanly, never throw.
- **Label AI.** Any LLM path takes `aiProvider: 'platform' | 'ollama' | 'none'`.
- **No hardcoded endpoints.** Use env vars.
- **Naming:** PascalCase types/components, camelCase functions, kebab-case files.

## 6. Validate

```typescript
import { ModuleRegistry } from '@muralink/core'
import { manifest } from '@muralink/module-contacts'

const reg = new ModuleRegistry()
reg.register(manifest)
reg.getDependencyGraph().validate()  // throws CycleError / MissingDependencyError
```

`modules/url/` is the canonical worked example — read it alongside this spec.
