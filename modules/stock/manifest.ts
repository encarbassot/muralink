import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'stock',
  version: '0.0.0',
  dependencies: [],
  types: ['YStockItem'],
  views: [
    {
      id: 'stock-list',
      platforms: ['web'],
      sizes: ['2x2', '2x3'],
      component: './implementations/web/views/StockList',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
