import { create } from 'zustand'
import type { NavNode, GridItem } from '@/types/navigation'

interface NavigationState {
  stack: NavNode[]
  selectedByNode: Record<string, string>
  previewItem: GridItem | null
  viewMode: 'columns' | 'grid' | 'bento'
  gridZoom: number
  pathViewMode: 'bubbles' | 'text'
  splitMode: boolean
  rightViewMode: 'columns' | 'grid'
  refreshToken: number

  pushNode(node: NavNode): void
  popToIndex(index: number): void
  selectItem(nodeId: string, itemId: string): void
  setPreview(item: GridItem | null): void
  reset(rootNode: NavNode): void
  refresh(): void
  setViewMode(mode: 'columns' | 'grid' | 'bento'): void
  setGridZoom(level: number): void
  togglePathViewMode(): void
  toggleSplitMode(): void
  setRightViewMode(mode: 'columns' | 'grid'): void
}

export const useNavigation = create<NavigationState>((set, get) => ({
  stack: [],
  selectedByNode: {},
  previewItem: null,
  viewMode: (localStorage.getItem('viewMode') ?? 'columns') as 'columns' | 'grid' | 'bento',
  gridZoom: parseInt(localStorage.getItem('gridZoom') ?? '2', 10),
  pathViewMode: (localStorage.getItem('pathViewMode') ?? 'bubbles') as 'bubbles' | 'text',
  splitMode: localStorage.getItem('splitMode') === 'true',
  rightViewMode: (localStorage.getItem('rightViewMode') ?? 'columns') as 'columns' | 'grid',
  refreshToken: 0,

  pushNode: (node) => {
    const { stack, selectedByNode } = get()
    set({
      stack: [...stack, node],
      selectedByNode: { ...selectedByNode },
      previewItem: null,
    })
  },

  popToIndex: (index) => {
    const { stack } = get()
    const next = stack.slice(0, index + 1)
    const nextSelected: Record<string, string> = {}
    for (const n of next) {
      const existing = get().selectedByNode[n.id]
      if (existing) nextSelected[n.id] = existing
    }
    set({ stack: next, selectedByNode: nextSelected, previewItem: null })
  },

  selectItem: (nodeId, itemId) => {
    set((s) => ({
      selectedByNode: { ...s.selectedByNode, [nodeId]: itemId },
    }))
  },

  setPreview: (item) => set({ previewItem: item }),

  reset: (rootNode) => {
    set({ stack: [rootNode], selectedByNode: {}, previewItem: null })
  },

  refresh: () => set((s) => ({ refreshToken: s.refreshToken + 1 })),

  setViewMode: (mode: 'columns' | 'grid' | 'bento') => {
    localStorage.setItem('viewMode', mode)
    set({ viewMode: mode })
  },

  setGridZoom: (level) => {
    const clamped = Math.max(1, Math.min(10, level))
    localStorage.setItem('gridZoom', String(clamped))
    set({ gridZoom: clamped })
  },

  togglePathViewMode: () => {
    const next = get().pathViewMode === 'bubbles' ? 'text' : 'bubbles'
    localStorage.setItem('pathViewMode', next)
    set({ pathViewMode: next })
  },

  toggleSplitMode: () => {
    const next = !get().splitMode
    localStorage.setItem('splitMode', String(next))
    set({ splitMode: next })
  },

  setRightViewMode: (mode) => {
    localStorage.setItem('rightViewMode', mode)
    set({ rightViewMode: mode })
  },
}))
