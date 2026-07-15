import type { GridLayoutConfig, GridPersistenceAdapter } from '@muralink/types'

export const localStorageAdapter: GridPersistenceAdapter = {
  async load(layoutId: string): Promise<GridLayoutConfig | null> {
    try {
      const raw = localStorage.getItem(`grid:${layoutId}`)
      if (!raw) return null
      return JSON.parse(raw) as GridLayoutConfig
    } catch {
      return null
    }
  },
  async save(config: GridLayoutConfig): Promise<void> {
    try {
      localStorage.setItem(`grid:${config.layoutId}`, JSON.stringify(config))
    } catch {
      // Storage quota exceeded or private browsing — fail silently
    }
  },
}
