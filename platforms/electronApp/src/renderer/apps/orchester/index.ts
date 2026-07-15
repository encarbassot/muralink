import type { AppDescriptor } from '@/types/navigation'
import { OrchesterApp } from './OrchesterApp.js'

export const OrchesterAppDescriptor: AppDescriptor = {
  id: 'orchester',
  name: 'Orchester',
  icon: '🎛',
  rootNode: {
    id: 'orchester-root',
    label: 'Orchester',
    icon: '🎛',
    appId: 'orchester',
    parentId: null,
  },
  createProvider() {
    return {
      async getChildren() { return [] },
      resolveNode() { return null },
    }
  },
  component: OrchesterApp,
}

export { OrchesterApp }
