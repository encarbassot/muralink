// tracker module manifest. Time tracking: timers (buttons, usually backed by a
// project mural) and time entries (elapsed spans). Leaf module — muralId is a
// soft reference, not a dependency edge.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'tracker',
  version: '0.0.0',
  dependencies: [], // leaf module
  types: ['YTimerDef', 'YTimeEntry'],
  views: [
    {
      id: 'timer-board',
      platforms: ['web', 'extension'],
      sizes: ['2x2', '2x3', '3x3'],
      component: './implementations/web/views/TimerBoard',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
