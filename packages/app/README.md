# @muralink/app

The single shared React app. Every platform that shows a dashboard — web,
electron, the tunnel guest view — mounts the *same* component and injects its
environment. There is no "web version" of a feature and a separate "desktop
version" of it.

```tsx
import { App } from '@muralink/app'

<App env={{ apiBase: '/api', token, platform: 'web' }} />
```

## What lives here

- **[src/App.tsx](src/App.tsx)** — the shell: routing, layout, the dashboard
  surface, and the modal stack.
- **[src/registry.tsx](src/registry.tsx)** — the cell registry. Every widget the
  omnibar can offer is registered here as a `CellModule` (descriptor + render).
  A module that is not in `registerAll()` does not exist as far as the picker is
  concerned, however complete the module itself is.
- **[src/WebAddElementModal.tsx](src/WebAddElementModal.tsx)** — the "add a
  widget" picker, built on `@muralink/omnibar`.
- **[src/TunnelApp.tsx](src/TunnelApp.tsx)** — the guest surface, exported as
  `@muralink/app/tunnel`. What someone sees when they open a share link.
- **[src/api/](src/api/)** — typed clients for the core's module routes.

## Adding a widget

1. Build the view in the module (`modules/<name>/implementations/web/views/`).
2. Register a `CellModule` here — descriptor (label, icon, sizes) plus `render`.
3. Add it to `registerAll()` in [src/registry.tsx](src/registry.tsx).

Steps 1 and 3 are independent: a finished module with no registry entry is
invisible, which is the single most common reason a new widget "does not appear".

## Rules

- **This package composes, it does not implement.** Feature logic belongs in the
  module. If a cell here grows business rules, they are in the wrong place.
- **No platform detection.** Behaviour that differs per platform arrives through
  `env`, never through sniffing `window` or `process`.
- The app assumes nothing about where data lives — `@muralink/spaces` decides
  whether a collection is local, on an orchester, or in an encrypted cloud vault.
