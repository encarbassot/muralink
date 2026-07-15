// REQUIRED. The only mandatory file in a module — everything else is optional.
// Copy this folder to start a new module. A module declares WHAT it can show
// and at WHICH sizes; the platform decides WHERE and HOW.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'template', // globally unique module id — rename this
  version: '0.0.0',
  dependencies: [], // other module ids; forms a DAG — no cycles
  types: [], // type ids this module exposes, e.g. ['YContact']
  views: [
    {
      id: 'template-card',
      platforms: ['web'],
      sizes: ['1x1'],
      component: './implementations/web/views/Card.1x1',
    },
  ],
  // interceptorScripts: ['someAction'], // only if you ship interceptor/ scripts
  platforms: ['web'], // where this module CAN run (declare capability)
}

export default manifest
