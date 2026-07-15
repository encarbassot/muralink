import type { AppDescriptor } from '@/types/navigation'
import { DashboardApp } from './DashboardApp'

export const DashboardAppDescriptor: AppDescriptor = {
  id: 'dashboard',
  name: 'Dashboard',
  icon: '⊟',
  rootNode: {
    id: 'dashboard-root',
    label: 'Dashboard',
    icon: '⊟',
    appId: 'dashboard',
    parentId: null,
  },
  createProvider() {
    return {
      async getChildren() { return [] },
      resolveNode() { return null },
    }
  },
  component: DashboardApp,
}
