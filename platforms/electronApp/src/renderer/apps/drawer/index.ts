import type { AppContentProvider, GridItem, NavNode } from '@/types/navigation'
import type { AppDescriptor } from '@/types/navigation'

export function createDrawerProvider(installedApps: AppDescriptor[]): AppContentProvider {
  return {
    async getChildren(_nodeId: string): Promise<GridItem[]> {
      return installedApps.map((app) => ({
        id: app.id,
        label: app.name,
        icon: app.icon,
        contentType: 'app',
        isNavigable: true,
        meta: { appId: app.id },
      }))
    },

    resolveNode(_item: GridItem): NavNode | null {
      return null
    },
  }
}
