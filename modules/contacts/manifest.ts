import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'contacts',
  version: '0.0.0',
  dependencies: ['url'],
  types: ['YContact'],
  views: [
    {
      id: 'contacts-list',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/ContactList',
    },
    {
      id: 'contact-card',
      platforms: ['web'],
      sizes: ['1x1'],
      component: './implementations/web/views/ContactCard',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
