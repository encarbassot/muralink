// video-editor module manifest. Layered photo/video editor — see
// docs/ideas/media-editor.md for the full vision. This module is the
// Muralink-side sync surface: project/op-log CRUD + a live topic per project.
// Actual editing UIs (Android, desktop, this web view) are clients of it.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'video-editor',
  version: '0.1.0',
  dependencies: [], // leaf module — originals live in /api/storage, referenced by path, not by module dependency
  types: ['YProject', 'YOp', 'YAsset'],
  views: [
    {
      id: 'video-editor-card',
      platforms: ['web'],
      sizes: ['2x2', '2x3', '3x2', '3x3'],
      component: './implementations/web/views/VideoEditorCard',
    },
  ],
  platforms: ['web', 'mobile', 'local-server'],
}

export default manifest
