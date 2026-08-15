// maps module manifest. GPX tracks + saved emoji locations over Leaflet.
// Local-first: state persists to localStorage; only tile fetches touch the
// network and the UI degrades cleanly without them.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'maps',
  version: '0.1.0',
  dependencies: [],
  types: [],
  views: [
    {
      id: 'maps-app',
      platforms: ['web'],
      sizes: ['3x3'],
      component: './implementations/web/views/MapsApp',
    },
  ],
  platforms: ['web'],
}

export default manifest
