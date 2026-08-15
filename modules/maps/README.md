# @muralink/module-maps

GPX tracks and saved places on a Leaflet surface. Import a track, keep your
locations, look at them offline.

## What lives here

- **[manifest.ts](manifest.ts)** — a leaf module with no shared types of its
  own.
- **[implementations/web/views/MapView.tsx](implementations/web/views/MapView.tsx)** —
  the map surface.
- **[implementations/web/views/MapsApp.tsx](implementations/web/views/MapsApp.tsx)** —
  the full view: track list, import, detail.

## Rules

- **Tiles are the one thing that needs the network.** Everything else — your
  tracks, your places — is local. Degrade to a blank canvas with the data drawn
  on it rather than to an error.
- **A track is imported, not linked.** The GPX becomes yours on import; the
  module never depends on the file staying where it was.
