// gallery module manifest. A media lens over the NAS storage: indexes photos
// and videos already living under the storage root, extracts EXIF, generates
// thumbnails, and lets the user tag/filter/browse. It never owns the bytes —
// the file layer stays generic; gallery is a read-mostly index plus its own
// tag/album entities.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'gallery',
  version: '0.0.0',
  dependencies: [], // leaf: consumes storage via an injected contract, not the drive module
  types: ['YMediaItem', 'YMediaTag', 'YAlbum'],
  // Phase 1: the web UI (wall + cell) lives app-side like the storage explorer;
  // the module ships types + the server index. Views migrate here in phase 2.
  views: [],
  platforms: ['web', 'local-server'],
}

export default manifest
