// calcsheet module manifest. A deterministic spreadsheet: formula cells, reusable
// sandboxed functions, global variables, and block rules. Leaf module (its engine
// is @muralink/calc); other modules embed it as the generic table later.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'calcsheet',
  version: '0.0.0',
  dependencies: [], // leaf — the engine is a package, not a module dep
  types: ['YCalcSheet'],
  views: [
    {
      id: 'calcsheet-app',
      platforms: ['web'],
      sizes: ['2x2', '2x3', '3x2', '3x3'],
      component: './implementations/web/views/CalcSheetApp',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
