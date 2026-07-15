import { create } from 'zustand'

export interface LayoutMeta {
  id: string
  label: string
  icon?: string
  parentId?: string
}

interface LayoutState {
  layouts: Record<string, LayoutMeta>
  navigationStack: string[]

  // Root layout id — always the dashboard
  rootLayoutId: string

  currentLayoutId: () => string
  createLayout: (meta: Omit<LayoutMeta, 'id'>) => string
  updateLayout: (id: string, patch: Partial<LayoutMeta>) => void
  deleteLayout: (id: string) => void
  navigateTo: (layoutId: string) => void
  navigateBack: () => void
  navigateToRoot: () => void
}

const ROOT_LAYOUT_ID = 'electron-dashboard'

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: {
    [ROOT_LAYOUT_ID]: { id: ROOT_LAYOUT_ID, label: 'Dashboard' },
  },
  navigationStack: [ROOT_LAYOUT_ID],
  rootLayoutId: ROOT_LAYOUT_ID,

  currentLayoutId: () => {
    const stack = get().navigationStack
    return stack[stack.length - 1] ?? ROOT_LAYOUT_ID
  },

  createLayout: (meta) => {
    const id = `layout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({
      layouts: { ...s.layouts, [id]: { ...meta, id } },
    }))
    return id
  },

  updateLayout: (id, patch) => {
    set((s) => ({
      layouts: {
        ...s.layouts,
        [id]: { ...s.layouts[id]!, ...patch },
      },
    }))
  },

  deleteLayout: (id) => {
    if (id === ROOT_LAYOUT_ID) return
    set((s) => {
      const layouts = { ...s.layouts }
      delete layouts[id]
      const stack = s.navigationStack.filter((l) => l !== id)
      return { layouts, navigationStack: stack.length ? stack : [ROOT_LAYOUT_ID] }
    })
  },

  navigateTo: (layoutId) => {
    set((s) => ({ navigationStack: [...s.navigationStack, layoutId] }))
  },

  navigateBack: () => {
    set((s) => {
      if (s.navigationStack.length <= 1) return s
      return { navigationStack: s.navigationStack.slice(0, -1) }
    })
  },

  navigateToRoot: () => {
    set({ navigationStack: [ROOT_LAYOUT_ID] })
  },
}))
