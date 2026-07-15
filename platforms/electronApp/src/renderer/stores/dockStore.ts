import { create } from 'zustand'
import type { DockItem } from '@muralink/shell'

interface DockState {
  items: DockItem[]
  setItems(items: DockItem[]): void
  clearItems(): void
}

export const useDock = create<DockState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  clearItems: () => set({ items: [] }),
}))
