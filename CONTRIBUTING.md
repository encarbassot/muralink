# Contributing

Thanks for looking. This is a monorepo for one product, and most of what you
need to know is *where a change belongs* — the layout is the architecture.

## Where does my change go?

| The change is about… | It belongs in |
|---|---|
| How a feature works (calendar logic, contacts merge) | `modules/<name>/` |
| Storage and sync mechanics | `packages/spaces/` |
| The bento grid engine (drag, resize) | `packages/ui/` |
| The shared app, or which widgets exist | `packages/app/` |
| The public embed API | `packages/embed/` |
| The self-hosted server and its deploy wizard | `platforms/server/`, `packages/orchester/` |
| A specific deployment's configuration | `instances/<name>/` |

A module never implements another module's feature, and `embed` only composes —
it never implements feature logic.

## Getting it running

```sh
npm install            # npm workspaces; one install at the root
npm run orchester      # the instance TUI
npm run dev -w @muralink/platform-web
```

Node 20 or newer.

## The rules that are not style

These come from the product, so a PR that breaks one will be asked to change
regardless of how good the code is.

- **Local-first.** Every feature works offline. The network is an optional path
  in every function, never a precondition. A feature that cannot degrade
  cleanly offline needs a different design, not a spinner.
- **Single-user core.** No multi-tenant or multi-account logic in the open
  platform. Several people sharing one instance is the enterprise front
  (`packages/multiuser`); several isolated accounts is a different product.
- **No module hardcodes a platform.** Declare capability in
  `ModuleManifest.platforms` and let the runtime decide.
- **No circular dependencies between modules.** If two modules need each other,
  what they actually need is a shared primitive type in `packages/types`.
- **Some identifiers are deliberately still `ELIO_*` / `elio-*`** — environment
  variables and IndexedDB database names. Renaming them breaks live data and
  running deployments. Leave them alone unless you are doing a deliberate,
  complete migration.

## Adding a module

1. Copy `modules/_template/`.
2. Declare a `ModuleManifest`: id, types, views, platforms, dependencies.
3. Implement per environment under `implementations/` — `web/`, `server/`, …
4. Register the server routes and schema in `platforms/server/`.
5. If it has a widget, register a `CellModule` in `packages/app/src/registry.tsx`
   **and add it to `registerAll()`**. A module that is not in that array does
   not appear in the picker, no matter how finished it is.
6. Write the README. See `packages/types/README.md` for the shape: what it is,
   what lives here, and the rules that are not obvious from the code.

## Pull requests

- One concern per PR.
- Say what you changed and why. The why is the part reviewers cannot reconstruct.
- Match the surrounding code: comment density, naming, idiom.
- Comments explain decisions, not mechanics. If a line needs a comment to say
  what it does, rewrite the line.

## Reporting a vulnerability

Do not open a public issue. See [SECURITY.md](SECURITY.md).
