# AGENTS.md — Muralink platform

Orientation for an AI agent (or new contributor) working in this repo. Read
[README.md](README.md) first for the product pitch and quickstart.

## Mental model

Muralink is a **local-first, modular platform**. Three layers:

1. **Primitive types** (`packages/types`) — zero-dependency interfaces shared by
   everything. The interoperability contract.
2. **Modules** (`modules/*`) — installable features (notes, contacts, calendar,
   reminders, url, appointments…). Each is self-contained and declares a
   `ModuleManifest`. A module has web views, a server router, and a store; it
   does **not** know where it will be rendered.
3. **Platforms** (`platforms/*`) — runtimes that mount modules: `server` (the
   orchester API a company self-hosts), `web`/`electron`/`backoffice` clients.

**Storage spaces** (`packages/spaces`) are the data layer: every item lives in
exactly one space — `local` (IndexedDB, default/offline), `orchester` (a
company server over HTTP), or an encrypted cloud backup. Local-first always;
remote is opt-in.

**`@muralink/embed`** (`packages/embed`) is the single public React surface — it
composes the modules into `MuralBoard` / `MuralDashboard` and is the package
published to npm.

## Where to work

| Change is about… | Edit |
|---|---|
| How a feature *works* (notes editing, calendar logic) | `modules/<name>/` |
| Storage / sync mechanics | `packages/spaces/` |
| The grid engine (drag/resize) | `packages/ui/` |
| The public embed API / dashboard composition | `packages/embed/` (see its AGENTS.md) |
| The self-hosted API | `platforms/server/` |
| A specific deployment's config | `instances/<name>/` |

Features live in `modules/*` and `packages/*`. `embed` only **composes** — don't
implement feature logic there.

## Conventions

- **Brand: Muralink** (mural.ink). Scope `@muralink/*`, symbols `Mural*`, theme
  class `.mural-root`, attribution header `X-Mural-User`.
- **Sentence case** in filenames, variables, comments.
- **Local-first in every function** — network calls are always an optional path;
  features must degrade cleanly offline.
- **No module hardcodes a platform** — declare capability via `ModuleManifest.platforms`.
- **No circular deps between modules** — if you need one, extract a primitive type.
- Some runtime identifiers are intentionally still `ELIO_*` / `elio-*`
  (`ELIO_API_TOKEN`, IndexedDB db names): renaming them breaks live data and
  deployed integrations. Leave them unless doing a deliberate migration.

## The tunnel (what's NOT here)

The cloud API that bridges companies for cross-org sharing — the "tunnel" or
mother API — is **not** in this repo and never should be. This is the open
platform; the tunnel is the closed, monetized core. Clients that *connect* to it
(e.g. the encrypted backup space) may live here; its server logic must not.

## Verify

```bash
npm install
npm run build -w @muralink/embed
npx tsc --noEmit -p packages/embed/tsconfig.json
```

Publishing the embed: `scripts/publish-embed.sh` (bundled single package). Repo
topology / per-package repos: [REPOS.md](REPOS.md).
