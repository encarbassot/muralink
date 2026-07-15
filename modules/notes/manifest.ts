// notes module manifest. A minimal local-first note: a textarea persisted to
// ModuleContext.storage. No module deps — exposes its own YNote type.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'notes',
  version: '0.0.0',
  dependencies: [], // leaf module
  types: ['YNote'],
  views: [
    {
      id: 'notes-card',
      platforms: ['web', 'extension'],
      sizes: ['1x1', '2x1', '2x2'],
      component: './implementations/web/views/NotesCard',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
