// habits module manifest. Daily round checks (good and bad habits). Depends on
// reminders for the "also a todo/alarm" link; the tracker link stays a soft
// reference (no code dependency).

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'habits',
  version: '0.0.0',
  dependencies: ['reminders'],
  types: ['YHabitDef', 'YHabitCheck'],
  views: [
    {
      id: 'habits-row',
      platforms: ['web', 'extension'],
      sizes: ['2x1', '2x2', '3x2'],
      component: './implementations/web/views/HabitsRow',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
