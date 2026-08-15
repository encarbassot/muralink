// The murales module as a bento cell. Registered by platforms into their
// CellRegistry. The card click opens the full MuralesApp (web).

import type { CellModule } from '@muralink/shell'
import { MuralesCard } from './implementations/web/views/MuralesCard.tsx'

export const muralesCell: CellModule = {
  descriptor: {
    moduleId: 'murales',
    label: 'Murales',
    icon: '🧱',
    description: 'Pinboards digitales — documento markdown + cuadrícula libre, compartibles por enlace',
    defaultSize: '2x2',
    availableSizes: ['1x1', '1x2', '2x1', '2x2', '2x3', '3x2'],
  },
  render: (_cell, ctx) => (
    <MuralesCard onExpand={(muralId) => ctx.openModal?.('murales', muralId)} />
  ),
}
