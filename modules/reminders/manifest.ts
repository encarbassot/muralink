// reminders module manifest. Local-first checklists with due dates. No module
// deps — exposes its own YReminder type.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'reminders',
  version: '0.0.0',
  dependencies: [], // leaf module
  types: ['YReminder'],
  views: [
    {
      id: 'reminders-app',
      platforms: ['web', 'extension'],
      sizes: ['1x2', '2x2', '2x3'],
      component: './implementations/web/views/RemindersApp',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
