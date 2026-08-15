import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'mail',
  version: '0.0.0',
  dependencies: [],
  types: ['YEmailMessage', 'YMailFolder', 'YMailAttachment'],
  views: [],
  platforms: ['local-server', 'electron', 'web'],
}

export default manifest
