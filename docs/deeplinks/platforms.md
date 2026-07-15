# Deeplink — platforms

The runtimes that mount modules. Each instantiates a `ModuleRegistry` with the
locally installed modules and renders their `ViewSpec` declarations. All are open
source and self-hostable.

A platform only needs to know how to render a `ViewSpec` — it never knows what's
inside. It implements `ViewRenderer.render(spec, size, context)`.

## `platforms/server`

- **Stack:** Express API + git DB + file storage + nginx.
- **Role:** private local-network runtime. **API only** — the frontend is
  `platforms/web`; they talk over HTTP.
- **Contains:** nginx, the Express API, the private git-DB, file storage, local git.
- **Self-hostable** on any Linux machine. Single-command Docker install. The user
  owns the code — edit ports, nginx config, git remote, anything.
- **Prior art:** `🧠/LOCAL-SERVER/betty-server` (Express :3131, drive/notes
  routes, multer uploads). To add: `ModuleRegistry` wiring + `isomorphic-git` DB.

## `platforms/web`

- **Stack:** React + Vite + TypeScript.
- **Role:** the primary interface — a **bento grid** that renders module views by
  `BentoSize`. Self-hostable; can be iframed into our hosted frontend.
- **Live repo** — always up to date.
- **Prior art:** `🧠/WEB_SERVICE` (React+Vite). Its auth/share flow is a separate
  concern; the bento grid does not exist yet and is built here.

## `platforms/extension`

- **Stack:** Chrome MV3 + TypeScript. The lightweight core runtime.
- **Contains:** module store (install/update), git client (push/pull to State 2
  or 3), data instance manager, widget renderer (new tab or overlay on any site).
- **Overlays** are configured in DESIGNER — the user picks which widgets appear on
  which URL patterns; the extension executes that configuration.
- **Prior art (richest in the repo):** `🧠/EXTENSION` — `MuralBlockManifest`,
  block `registry`, visual pipeline `editor`, shadow-DOM `PlaneManager`,
  `Omnibar` (Cmd+K). Map `MuralBlock` → a module of `kind: function`.

## `platforms/designer`

- **Stack:** React + Vite. Was `PRESENTATION`, now DESIGNER everywhere.
- **Role:** visual block editor. Blocks = modules; connections = integrations or
  Interceptor actions. Enter a block to view/edit its code (multi-language).
  Configures the extension overlay. Includes a drag-and-connect entity modeler
  with AI assist and code view per block.
- **Prior art:** `🧠/DESIGNER` has three sub-projects — consolidate on `cancas`
  (most mature canvas/node editor: panels, keyframes, layers); drop `elioblog`
  and `elioputo`.

## `platforms/interceptor`

- **Stack:** Node + Playwright. Self-hostable or on our AWS — **same codebase**.
- **Role:** webscraper engine + action automation. Runs a module's
  `implementations/interceptor/` scripts in a headless browser.
- **Two modes:** deterministic (record click/type/submit → store as a registered
  action) and AI-assisted (InterceptorAI generates/repairs scripts). The
  extension can also run the same workflows locally via content scripts — same
  workflow system, different execution context.

See [interceptor.md](interceptor.md) and [self-hosting.md](self-hosting.md) for depth.
