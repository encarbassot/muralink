# Architecture

Expanded from [CLAUDE.md](../CLAUDE.md) (the source of truth). This document
orients; the deeplinks under [deeplinks/](deeplinks/) go deep per theme.

## What this is

A local-first, open source, multi-device platform where users install modules to
build their own tools. Offline by default; sharing is an opt-in path through our
API. Single-user at the core. Stack-agnostic modules.

## Layers

### Layer 0 — primitive types (`packages/types`)
Zero-dependency TypeScript interfaces + pure validators. `YUrl`, `YEmail`,
`YPhone`, `YMoney`, `YDateTime`, `YDuration`, `YPassword`. The interoperability
atoms — every module builds on them. → [deeplinks/types-and-modules.md](deeplinks/types-and-modules.md)

### Layer 1 — module graph (`modules/`)
Each module is a node in a DAG. Dependencies are static (`ModuleManifest`),
resolved at build time, never from a remote server. A module declares what it can
show and at what sizes; the platform decides where and how.

### Layer 2 — platforms (`platforms/`)
Runtimes that mount modules. Each instantiates a `ModuleRegistry` and renders
`ViewSpec` declarations via its own `ViewRenderer`.
→ [deeplinks/platforms.md](deeplinks/platforms.md)

| Platform | Stack | Role |
|---|---|---|
| `server` | Node + Express | API runtime + git DB + file storage |
| `web` | React + Vite | Bento grid UI — primary interface |
| `extension` | Chrome MV3 | Lightweight core runtime, overlays |
| `designer` | React + Vite | Visual block editor, entity modeler |
| `interceptor` | Node + Playwright | Webscraper / action automation |

## Core contracts

- **`ModuleManifest`** — id, version, dependencies, types, views, platforms.
- **`ModuleRegistry`** (`@muralink/core`) — register / resolve / getViewsForPlatform /
  getDependencyGraph.
- **`ViewRenderer`** — `render(spec, size, context)`, implemented per platform.

See [module-spec.md](module-spec.md) to author a module.

## Storage — three states

1. **Browser/device local** — IndexedDB/fs. Offline, no sharing.
2. **Local server** — git-based DB on the user's machine. LAN only.
3. **Cloud** — our API. Required for any sharing. The business lives here.

→ [deeplinks/storage-and-git.md](deeplinks/storage-and-git.md)

## Business model (one line)

We sell AI-generated code and AI execution; everything else (AWS, Claude, Stripe,
domains, tunnels) is an optional wrapper service, all substitutable. The offline
core is free and never touches our servers.
→ [deeplinks/business-model.md](deeplinks/business-model.md) ·
[deeplinks/token-system.md](deeplinks/token-system.md)

## Conventions

- Sentence case everywhere; PascalCase types/components; camelCase functions;
  kebab-case files/folders.
- Local-first in every function — network is an optional path.
- Never hardcode a platform inside a module — declare capability in the manifest.
- Every AI call takes `aiProvider: 'platform' | 'ollama' | 'none'`.
- No circular module deps — extract a primitive type instead.
- Fail gracefully offline.

## Implementation priority

1. `packages/types` ✅
2. `packages/core` ✅
3. `modules/url` ✅ (first compliant module)
4. `modules/drive`
5. `modules/contacts`
6. monorepo setup ✅ (npm workspaces, shared tsconfig)
7. `platforms/server` (wire ModuleRegistry into Express)
8. `platforms/web` (wire ModuleRegistry into the bento grid)

Do not start DESIGNER, interceptor, or ecommerce until 1–5 are solid.
