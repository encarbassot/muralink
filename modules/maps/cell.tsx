// Maps as a bento cell — thin wrapper mounting the existing full app in place.
// A tiny map is close to useless, so availableSizes starts large.

import type { CellModule } from '@muralink/shell'
import { MapsApp } from './implementations/web/index.ts'

export const mapsCell: CellModule = {
  descriptor: {
    moduleId: 'maps',
    label: 'Maps',
    icon: '🗺️',
    description: 'Mapa',
    defaultSize: '2x2',
    availableSizes: ['2x2', '2x3', '3x2', '3x3'],
  },
  render: () => <MapsApp />,
}
