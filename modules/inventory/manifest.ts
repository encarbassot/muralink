import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'inventory',
  version: '0.0.0',
  dependencies: [],
  types: ['YItem', 'YStockMovement'],
  views: [
    {
      id: 'inventory-list',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/InventoryList',
    },
    {
      id: 'stock-alert',
      platforms: ['web'],
      sizes: ['1x1'],
      component: './implementations/web/views/StockAlert',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
