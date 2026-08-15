# extension — Muralink side panel (Chromium, MV3)

Your modules as **temporary cards** in the native Chrome side panel: the same
components the web app ships (post-it notes = `MarkdownEditor`, calendar =
`DayStrip`), minimal, directly editable. Clicking a card focuses it and shows
its declared **focus surfaces** — rows of square action buttons and edge
panels (`CellModule.focusSurfaces`, rendered with `@muralink/ui`'s
`ActionRow`/`ActionButton`/`EdgePanel`).

Auth: cloud only (app.mural.ink) via the account token; logged out the panel
is fully local (IndexedDB — extension pages have their own origin storage).

Future (from the original scaffold intent): overlays on arbitrary sites whose
URL patterns are configured in DESIGNER, module store, interceptor hooks. See
[docs/deeplinks/platforms.md](../../docs/deeplinks/platforms.md).

## Build & load

```bash
npm -w @muralink/platform-extension run build   # → dist/
```

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `platforms/extension/dist`.
3. Click the toolbar icon — the side panel opens.

## Dev loop

MV3 pages cannot load from a dev server (CSP). Use:

```bash
npm -w @muralink/platform-extension run dev     # vite build --watch
```

then hit **Reload** on the extension in `chrome://extensions` after each build.

## Layout

- `public/manifest.json` — MV3, `side_panel`, `host_permissions` for the cloud.
- `public/sw.js` — opens the panel on toolbar click.
- `src/cards.tsx` — the cell registry (post-it notes, today's calendar) with
  their `focusSurfaces`.
- `src/SidePanelCard.tsx` — docks the focus surfaces at the card's edges.
- `src/account.ts` / `src/cloudVault.ts` — per-platform copies of the web
  build's auth + cloud-space wiring (trimmed to notes + events).
