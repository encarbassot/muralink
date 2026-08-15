// murales module manifest. A mural is a shareable digital pinboard: a markdown
// document whose rows are elements that can also be pinned to a free grid.
// Depends on notes for the in-place markdown editor.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'murales',
  version: '0.1.0',
  dependencies: ['notes'],
  types: ['YMural'],
  views: [
    {
      id: 'murales-card',
      platforms: ['web'],
      sizes: ['1x1', '2x2'],
      component: './implementations/web/views/MuralesCard',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
