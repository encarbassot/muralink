// url module manifest. A pure `type` module: it exposes the YUrl type and
// validation/normalization logic, no inter-module dependencies.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'url',
  version: '0.0.0',
  dependencies: [], // leaf module — no module deps
  types: ['YUrl'],
  views: [
    {
      id: 'url-card',
      platforms: ['web', 'extension'],
      sizes: ['1x1', '2x1'],
      component: './implementations/web/views/UrlCard',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
