# @muralink/embed — architecture

How the package is built, how the recursive dashboard works, and how to extend
it. Read [README.md](./README.md) first for usage. For a fast file map see
[AGENTS.md](./AGENTS.md).

## What this package is

`@muralink/embed` is the **single public surface** of the Muralink platform. It
does not implement features itself — it curates and re-exports the platform's
modules and packages behind one import, adds two host-facing composition
components (`MuralBoard`, `MuralDashboard`), and ships as one bundled file.

```
@muralink/embed
├── re-exports  @muralink/module-{notes,contacts,calendar,reminders}/web   (the apps)
├── re-exports  @muralink/spaces      (storage-space registry + factories)
├── re-exports  @muralink/ui          (bento grid engine)
├── uses        @muralink/shell       (ShellApp + CellRegistry, for the dashboard)
└── adds        MuralProvider · MuralBoard · MuralDashboard
```

At build time the lib config **inlines all of those `@muralink/*` deps into one
ESM file** and externalizes React, so the published package has no runtime
`@muralink/*` dependencies. See [Build & publish](#build--publish).

## Source layout

```
packages/embed/
├── src/
│   ├── index.ts            Public surface — the ONLY thing consumers import
│   ├── MuralProvider.tsx   Theme + identity + storage context. Renders .mural-root,
│   │                       registers remote spaces from the `spaces` prop.
│   ├── MuralBoard.tsx      Tabbed workspace (notes/reminders/contacts/calendar).
│   ├── CalendarBoard.tsx   Wraps the (controlled) CalendarApp onto useEvents.
│   ├── theme.css           The design tokens under .mural-root (light + dark).
│   └── dashboard/          The recursive bento dashboard:
│       ├── MuralDashboard.tsx  Composition: stack, edit mode, modals, persistence.
│       ├── registry.tsx        Cell registry — maps moduleId → rendered widget.
│       ├── AddElementModal.tsx Widget picker / omnibar.
│       ├── WidgetConfigModal.tsx  Per-cell config (size, on-click, module tabs).
│       ├── OnClickTab.tsx / SizeTab.tsx  Config tabs.
│       └── (TextEditModal, AppModal, Breadcrumb live inside MuralDashboard.tsx)
├── host/                   Standalone iframe host (Vite) for iframe embedding.
├── vite.lib.config.ts      Library build → dist/index.js + dist/embed.css.
└── dist/                   Build output (gitignored). What gets published.
```

## The recursive dashboard model

Recursion is **not** a live grid inside a cell. It's a **tree of layout
documents** addressed by hierarchical id:

- `MuralDashboard` keeps a breadcrumb **stack** of layout ids. It renders exactly
  one grid (`ShellApp` from `@muralink/shell`) keyed by the current layout id —
  descending remounts and loads that layout's cells.
- A **sub-dashboard cell** (the 🗂 widget) expands via
  `ctx.navigateTo(\`${layoutId}/${cellId}\`)`, pushing a child layout id like
  `pb:u1:board/cell-123`. Arbitrary nesting falls out for free.
- Each layout persists independently under `grid:<layoutId>` in the configured
  persistence adapter (localStorage by default; the whole tree is namespaced by
  the root `storageKey`).

The grid engine itself (`GridCanvas`, displacement algorithm, drag/resize) lives
in `@muralink/ui`; `@muralink/shell` wraps it with a `CellRegistry` and the
`CellContext` capabilities (`openModal`, `navigateTo`, `updateCell`,
`openTextEditor`).

### Cells (widgets)

`dashboard/registry.tsx` builds the `CellRegistry`. Each cell is a `CellModule`:
a `descriptor` (id, label, icon, default/available sizes) + a `render(cell, ctx,
isDragging)`. Embed's cells render the **local-first apps** (they read the
zustand stores), unlike the web platform's registry which used react-query. Cell
content data flows through storage spaces; the **layout** (position/size/props)
flows through the persistence adapter.

To **add a widget type**: add a `CellModule` in `registry.tsx` and register it in
`buildEmbedRegistry()`. If it needs a new module, add that module under
`modules/` first and re-export its app.

## Storage spaces (data layer)

From `@muralink/spaces`. A **space** is one place an item can live; an item
records its space in `spaceId` (runtime-only, stamped on read). The registry is
**per-collection** (`notes`, `contacts`, `events`, `reminders`):

- Modules register their `local` IndexedDB space (`makeIdbSpace`).
- `MuralProvider`, given `spaces.orchester`, registers an HTTP space
  (`makeHttpSpace`) per collection → the "Servidor" space.
- Each module store reads every **active** space and merges (per-space failure
  isolation), routes writes back to the item's own space, and can `moveItem`
  between spaces. Prefs (active/default space) persist in localStorage.

`@muralink/spaces` also has `makeTunnelSpace` (client-side AES-GCM encrypted
cloud backup) — a client to the `/tunnel` API. **No tunnel server logic ships in
embed.**

Contacts additionally support a read-only **adapter** (`makeJsonContactsAdapter`
/ `makeReadonlyContactsAdapter`) to surface an external platform's records.

## Identity & attribution

`MuralProvider` holds the optional `user` in context (`useMuralUser`). New items
get `createdBy = user.id`. When a remote space is configured, the HTTP space
sends `X-Mural-User: <id>` so the server records authorship (trusted, not
authenticated — a shared-token MVP).

## Theming

`theme.css` defines tokens under `.mural-root`, for `data-mural-theme="dark|light"`.
`MuralProvider` renders that class and applies the `tokens` prop as inline CSS
vars, so nothing leaks to the host `:root`. The bundle emits the CSS as a
separate `dist/embed.css` (exported as `@muralink/embed/theme.css`) that the host
imports once.

## Build & publish

- **Build:** `npm run build -w @muralink/embed` → `vite.lib.config.ts` →
  `dist/index.js` (ESM, all `@muralink/*` inlined, React external) + `dist/embed.css`.
- **Publish:** the published `package.json` points `main`/`exports` at `dist/`,
  drops the `@muralink/*` deps (bundled), keeps only React as a peer. A staged
  publish is prepared by `scripts/publish-embed.sh` (repo root) or manually from
  a folder containing `dist/` + a clean `package.json`. Published to npm as
  `@muralink/embed` under the `muralink` org.
- **Versioning:** bump `version`, rebuild, republish. npm never allows
  re-publishing the same version.

## Consuming it two ways

1. **npm / bundled component** — `npm i @muralink/embed`, import `MuralDashboard`.
2. **Submodule + Vite alias** — a host (e.g. BikeHunter) vendors the platform
   repo as a git submodule, runs the lib build, and aliases `@muralink/embed` at
   `.../packages/embed/dist/index.js` with `dedupe: ['react','react-dom']`.

Both consume the same bundled `dist/`.

## Invariants (don't break these)

- **`src/index.ts` is the whole public API.** Anything not exported there is
  internal.
- **React is a peer, never bundled** (avoids duplicate-React / invalid hook calls).
- **Local-first by default** — no code path requires a server unless the host
  passes `spaces`.
- **No `/tunnel` server logic** enters this package — only clients to it.
- **Styles stay under `.mural-root`** — never emit global CSS.
