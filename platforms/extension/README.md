# extension — not yet implemented (scaffold only)

Chromium MV3 extension. The lightweight core runtime: module store, git client,
data instance manager, widget renderer (new tab or overlay on any site).

- **Stack:** Chrome MV3 + TypeScript
- **Role:** runs modules client-side; renders overlays whose URL patterns are
  configured in DESIGNER.
- **Prior art (richest in the repo):** `🧠/EXTENSION` — a real pluggable system:
  `MuralBlockManifest` + block `registry` + visual pipeline `editor` + shadow-DOM
  `PlaneManager`. Reuse this; map `MuralBlock` → module of `kind: function`.

Deferred. See [docs/deeplinks/platforms.md](../../docs/deeplinks/platforms.md) and
[docs/deeplinks/interceptor.md](../../docs/deeplinks/interceptor.md).
