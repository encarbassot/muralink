# _template

Reference module. **Copy this folder** to create a new module, then rename
`manifest.id` and delete every part you don't need.

A module does not know where it will be rendered. It only declares what it can
show and at what sizes (`manifest.ts`); the platform decides where and how.

## What's required vs optional

| File / folder | Required? | Purpose |
|---|---|---|
| `manifest.ts` | **required** | `ModuleManifest` export — the only mandatory file |
| `types.ts` | optional | types this module exposes, built on `@muralink/types` |
| `implementations/web/` | optional | React views, named `[Name].[size].tsx` |
| `implementations/server/` | optional | Express route factory |
| `implementations/extension/` | optional | shadow-DOM overlay |
| `implementations/interceptor/` | optional | one file per automatable action |

Stack-agnostic by design: a single module can hold a React view, an Express
route, a Chrome content script, and a Playwright automation script — all here,
no single language enforced.

## Rules

- `manifest.platforms` declares **capability**; an `implementations/<platform>/`
  folder is the **realization**. Declare only what you actually ship.
- Every feature needing a server or the cloud must degrade cleanly offline.
- Any LLM-capable code path takes `aiProvider: 'platform' | 'ollama' | 'none'` —
  never hardcode.
- No circular module dependencies. If you reach for one, extract a primitive
  type into `@muralink/types` instead.
