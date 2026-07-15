# Deeplink — types and modules

Everything about the primitive types and the module system. Read this to author
or reason about a module without loading the rest of the docs.

## What a module is

A module is a self-contained node in the dependency graph. Every part is
**optional except the manifest**:

- **Canonical types** (`types.ts`) — new humane types it exposes, built on the
  primitives in `@muralink/types`.
- **Server implementation** (`implementations/server/`) — Express routes / logic.
- **Web implementation** (`implementations/web/`) — React views, one per bento size.
- **Extension implementation** (`implementations/extension/`) — shadow-DOM overlay.
- **Interceptor scripts** (`implementations/interceptor/`) — one file per
  automatable action, run headless on the interceptor host.

A module ships only the parts it needs. A pure `type` module (like `url`) is just
a manifest + `core.ts` + `types.ts`. A full integration ships server + web +
interceptor too. **No single language is enforced** across implementations.

A module does not know where it will be rendered. It declares what it can show
and at what sizes; the platform decides where and how.

## `ModuleManifest`

The required export. Dependencies are static and resolved at build time — **never
at runtime from a remote server.**

```typescript
type Platform = 'web' | 'extension' | 'mobile' | 'local-server'

type BentoSize = '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x2' | '3x3'

interface ViewSpec {
  id: string
  platforms: Platform[]
  sizes: BentoSize[]      // which grid sizes this view supports
  component: string       // path to the implementation component
}

interface ModuleManifest {
  id: string              // e.g. 'contacts', 'expenses'
  version: string         // semver
  dependencies: string[]  // other module ids — forms a DAG, no cycles
  types: string[]         // type ids this module exposes, e.g. ['YUrl']
  views: ViewSpec[]       // renderable widgets
  interceptorScripts?: string[] // e.g. ['sendWhatsApp', 'readNotionPage']
  platforms: Platform[]   // where this module CAN run
}
```

This is the strict `CLAUDE.md` contract — the source of truth for this project.
(An older `🧠/elio-modules/MODULE-SPEC.md` defined a richer manifest with
`kind/methods/properties/hosts` and an `Instance` envelope. That is prior art,
**not** the contract here. Revisit only if a later pass needs node-editor /
block-store metadata.)

## Canonical primitive types

Defined once in `@muralink/types`, the interoperability atoms. Two modules
referencing the same `YUrl` reference the same concept — that is the whole point.

```typescript
interface YUrl      { raw: string; normalized: string; domain: string }
interface YEmail    { address: string; label?: string }
interface YPhone    { number: string; countryCode: string; label?: string }
interface YMoney    { amount: number; currency: string; precision: number }
interface YDateTime { iso: string; timezone: string }
interface YDuration { seconds: number }
interface YPassword { hash: string; hint?: string; url?: YUrl }
```

Plus pure validators (`isValidUrl`, `isValidEmail`, `isValidMoney`) — no network,
no framework, safe anywhere.

## Dependency graph rules

- The module graph is a **DAG** — no circular dependencies.
- Dependencies are declared statically in `ModuleManifest.dependencies` and
  resolved at build time.
- **If you think you need a cycle, you need a new primitive type instead.** Two
  modules sharing a shape means that shape belongs in `@muralink/types`.
- `@muralink/core` enforces this: `ModuleRegistry.getDependencyGraph().validate()`
  throws `CycleError` or `MissingDependencyError`.

### Dependency order (leaf → consumer)

```
types + core
  └── url, drive                  (no module deps)
       └── contacts               (deps: url)
            └── expenses          (deps: contacts, types/Money)
       └── calendar, notes        (deps: types)
       └── passwords              (deps: url, types/Password)
  └── notion                      (adapter over: notes, drive)
  └── designer                    (deps: drive, url)
  └── ecommerce [future]          (deps: contacts, expenses, Pay API)
```

## Capability vs implementation

These are two different claims:

- **Capability** — `manifest.platforms` says where the module *can* run.
- **Implementation** — an `implementations/<platform>/` folder is where it
  *actually* runs.

Declare only platforms you actually ship. `manifest.views[].platforms` further
narrows where a specific view appears. A platform asks the registry
`getViewsForPlatform(p)` and only sees views that support `p`.

## The `_template/` structure, file by file

```
modules/_template/
├── manifest.ts                 # REQUIRED. ModuleManifest export.
├── types.ts                    # optional. Types this module exposes.
├── README.md                   # what / deps / views.
├── package.json                # @muralink/module-<id>, deps: @muralink/types
└── implementations/
    ├── web/
    │   ├── index.ts            # exports view components
    │   └── views/Card.1x1.tsx  # [Name].[size].tsx — reads ModuleContext
    ├── server/
    │   ├── index.ts
    │   └── routes.ts           # Express route factory
    ├── extension/
    │   └── overlay.tsx         # shadow-DOM overlay
    └── interceptor/
        └── action.ts           # one file = one automatable action
```

Copy the folder, rename `manifest.id`, delete every part you don't need.
`url/` is the canonical worked example.
