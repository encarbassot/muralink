import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'text',
  version: '0.0.0',
  dependencies: [],
  types: [],
  views: [
    {
      id: 'text-editor',
      platforms: ['web'],
      sizes: ['1x1', '2x2', '3x3'],
      component: './implementations/web/TextEditor',
    },
  ],
  platforms: ['web'],
}

export default manifest
