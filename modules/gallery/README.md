# @muralink/module-gallery

A media lens over your storage: indexes photos and videos, reads EXIF, builds
thumbnails, and lets you tag things. It does not own your files — it points at
them.

## What lives here

- **[manifest.ts](manifest.ts)** — `YMediaItem`, `YMediaTag`, `YAlbum`.
- **[implementations/server/](implementations/server/)** — the scanner (walks
  the storage root), EXIF extraction via `exifr`, thumbnails via `sharp`, and
  the index.
- **[implementations/web/](implementations/web/)** — the grid, the viewer and
  the tag surface.

## Rules

- **Originals are never moved, rewritten or deleted.** The index is derived
  data: delete the database and a rescan rebuilds it; delete an original and it
  is gone, which is exactly why this module never does that.
- **Leaf module.** It consumes storage through an injected contract rather than
  depending on the drive module — the folder it scans is configuration, not a
  module edge.
- **Tags are non-exclusive.** A photo can be in many; none of them is a folder.
