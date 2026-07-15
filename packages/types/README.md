# @muralink/types

Layer 0 — the primitive types. Zero dependencies. No React, no Express, no logic
beyond pure validators. Everything else in the system is built on top of these.

## What lives here

- **Primitives** ([src/primitives.ts](src/primitives.ts)) — the interoperability
  atoms: `YUrl`, `YEmail`, `YPhone`, `YMoney`, `YDateTime`, `YDuration`,
  `YPassword`, plus pure validators (`isValidUrl`, `isValidEmail`, `isValidMoney`).
- **Module contracts** ([src/module.ts](src/module.ts)) — `ModuleManifest`,
  `ViewSpec`, `BentoSize`, `Platform`, `ModuleContext`, `ModuleStorage`,
  `ViewRenderer`.

## Rules

- **Zero runtime dependencies.** If a change needs a dependency, it does not
  belong here.
- **Validators stay pure** — no network, no filesystem, no framework. Safe in a
  browser, a service worker, or Node.
- These are the atoms shared across modules. Two modules referencing the same
  `YUrl` are referencing the same concept — that is the whole point.

## Note

`ModuleContext` / `ModuleStorage` shapes are **provisional** — `CLAUDE.md` does
not pin them yet. They are intentionally minimal so each platform can back
storage with IndexedDB, `fs`, or the git-DB without changing the contract.
