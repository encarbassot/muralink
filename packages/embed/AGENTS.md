# AGENTS.md — @muralink/embed

Orientation for an AI agent (or new contributor) working on this package. Pair
with [README.md](./README.md) (usage) and [ARCHITECTURE.md](./ARCHITECTURE.md)
(internals).

## One-paragraph mental model

`@muralink/embed` is the **single public surface** of the Muralink platform: it
re-exports the platform's modules/packages behind one import and adds two
host-facing components — `MuralBoard` (tabbed) and `MuralDashboard` (recursive
bento grid). It ships as **one bundled ESM file** (all `@muralink/*` inlined,
React external). Everything is **local-first** (IndexedDB); remote sync via
storage `spaces` is opt-in. It contains **no `/tunnel` server logic** — only
clients to it.

## Where things are

| I want to… | Look at |
|---|---|
| Change the public API | `src/index.ts` (the only export surface) |
| Change theme/identity/spaces context | `src/MuralProvider.tsx` |
| Change the tabbed board | `src/MuralBoard.tsx` |
| Change the recursive dashboard | `src/dashboard/MuralDashboard.tsx` |
| Add/change a dashboard widget | `src/dashboard/registry.tsx` |
| Change design tokens / colors | `src/theme.css` |
| Change the library build | `vite.lib.config.ts` |
| Change an app's behaviour (notes, calendar…) | it's NOT here → `modules/<name>/` in the monorepo |
| Change storage/space mechanics | it's NOT here → `packages/spaces/` (`@muralink/spaces`) |
| Change the grid engine | it's NOT here → `packages/ui/` (`@muralink/ui`) |

This package **composes**; features live in `modules/*` and `packages/*`. If a
change is about how notes/contacts/calendar *work*, edit the module, not embed.

## Conventions

- **Public API = `src/index.ts`.** Don't rely on deep imports; if consumers need
  something, export it there.
- **Brand is Muralink** (mural.ink). Package scope `@muralink/*`, component
  prefix `Mural*`, theme class `.mural-root`, attribution header `X-Mural-User`.
  Do not reintroduce `Elio`/`@elio` (legacy name).
- **Runtime identifiers intentionally kept un-rebranded** (renaming breaks live
  data / deployed integrations): `ELIO_API_TOKEN` env var, `elio-*` IndexedDB DB
  names, `~/.elio` paths, the `/elio/api` URL namespace in the BikeHunter host.
  Leave them unless doing a deliberate, coordinated migration.
- **React is a peer** — never add it as a dependency; never bundle it.
- **Local-first default** — a new feature must work with no server; server paths
  go behind the `spaces` prop.
- **No `/tunnel` server code** in this package. A client to the tunnel is fine.
- **Styles under `.mural-root` only.**
- **Sentence case** in filenames/comments (repo-wide convention).

## Verify a change

```bash
# from the monorepo root
npx tsc --noEmit -p packages/embed/tsconfig.json     # typecheck
npm run build -w @muralink/embed                     # lib bundle builds
npm run host:dev -w @muralink/embed                  # try it in the iframe host
```

The end-to-end sandbox that mounts embed exactly like a host does (drawer
overlay, meta-tag user, Turbo-style remount) lives at
`examples/rails-host-sim/` in the monorepo — build it and drive it with a
headless browser to confirm mount, add-widget, sub-dashboard, and markdown-modal
flows.

## Publish

`@muralink/embed` is published to npm (org `muralink`). Bundled single package,
no dependency-order dance. See ARCHITECTURE.md → Build & publish, or
`scripts/publish-embed.sh` at the repo root. Bump `version`, rebuild, republish.

## Gotchas

- In dashboard **edit mode** a drag-shield covers cell content — descend/expand a
  sub-dashboard only works with edit mode OFF.
- The inline text-cell editor has a debounce/re-render race under fast automated
  typing; the full-screen markdown modal (text cell default click) is the robust
  path — prefer it in tests.
- The lib build inlines `@muralink/*`; if you add a new re-export from a module,
  make sure that module builds and is a workspace dep so the bundler resolves it.
