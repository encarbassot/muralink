import { create } from 'zustand'
import type { AppDescriptor } from '@/types/navigation'

interface PlatformState {
  activeAppId: string | null
  installedApps: AppDescriptor[]
  appsDrawerOpen: boolean

  registerApp(app: AppDescriptor): void
  openApp(id: string): void
  goToDrawer(): void
  toggleAppsDrawer(): void
  openAppsDrawer(): void
  closeAppsDrawer(): void
}

export const usePlatform = create<PlatformState>((set, get) => ({
  activeAppId: localStorage.getItem('activeAppId'),
  installedApps: [],
  appsDrawerOpen: false,

  registerApp: (app) => {
    const apps = get().installedApps
    if (apps.some((a) => a.id === app.id)) return
    set({ installedApps: [...apps, app] })
  },

  openApp: (id) => {
    localStorage.setItem('activeAppId', id)
    set({ activeAppId: id, appsDrawerOpen: false })
  },

  goToDrawer: () => {
    localStorage.removeItem('activeAppId')
    set({ activeAppId: null, appsDrawerOpen: false })
  },

  toggleAppsDrawer: () => set((s) => ({ appsDrawerOpen: !s.appsDrawerOpen })),
  openAppsDrawer: () => set({ appsDrawerOpen: true }),
  closeAppsDrawer: () => set({ appsDrawerOpen: false }),
}))
