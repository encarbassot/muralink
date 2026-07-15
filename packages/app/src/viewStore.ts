// Active main-content view. Apps and the dashboard are peers: the dock switches
// which one fills the content area. Persisted so a reload reopens the same view.

import { create } from 'zustand'

const KEY = 'elio.web.view'

export const DASHBOARD = 'dashboard'

interface Persisted {
  view: string
  instanceId?: string
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { view: DASHBOARD }
    return JSON.parse(raw) as Persisted
  } catch {
    return { view: DASHBOARD }
  }
}

const initial = load()

interface ViewState {
  view: string
  instanceId?: string
  // Switch the main content. id === 'dashboard' returns to the bento grid.
  setView: (view: string, instanceId?: string) => void
}

export const useView = create<ViewState>((set) => ({
  view: initial.view,
  instanceId: initial.instanceId,
  setView: (view, instanceId) => {
    try { localStorage.setItem(KEY, JSON.stringify({ view, instanceId })) } catch { /* ignore */ }
    set({ view, instanceId })
  },
}))
