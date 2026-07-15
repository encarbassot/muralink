// explorerStore — the Miller-column navigation state. `columns` is the stack of
// open directory paths (left → right). Selecting a folder truncates the stack
// past that column and pushes the folder; selecting a file sets `previewPath`
// (rightmost pane) without pushing a column. All mutations go through
// window.fsApi then bump `refreshToken` so visible columns reload.

import { create } from 'zustand'
import type { DirEntry } from '@/shared/fsApi'

interface Clipboard {
  path: string
  op: 'copy'
}

interface ExplorerState {
  columns: string[] // dir path per column, left → right
  selectedByCol: Record<string, string> // dirPath → selected child path
  previewPath: string | null // file under preview (rightmost pane)
  clipboard: Clipboard | null
  refreshToken: number // bump to force column reloads
  error: string | null
  pinnedFolders: string[] // paths pinned to the dock
  starredFolders: string[] // infinite starred paths
  viewMode: 'columns' | 'grid' // visualization mode
  gridZoom: number // 1-5 scale for grid icon size
  pathViewMode: 'bubbles' | 'text' // breadcrumb display mode
  splitMode: boolean // split pane mode
  rightViewMode: 'columns' | 'grid' // right pane view mode in split
  consoleOpen: boolean
  consoleHeight: number

  init: () => Promise<void>
  selectEntry: (colIndex: number, entry: DirEntry) => void
  copyToClipboard: (path: string) => void
  refresh: () => void
  setError: (msg: string | null) => void
  pinFolder: (path: string) => void
  unpinFolder: (path: string) => void
  starFolder: (path: string) => void
  unstarFolder: (path: string) => void
  navigateTo: (path: string) => void
  setViewMode: (mode: 'columns' | 'grid') => void
  setGridZoom: (level: number) => void
  togglePathViewMode: () => void
  toggleSplitMode: () => void
  setRightViewMode: (mode: 'columns' | 'grid') => void
  toggleConsole: () => void
  setConsoleHeight: (h: number) => void

  // fs ops (wrap fsApi, then refresh)
  rename: (path: string, newName: string) => Promise<void>
  mkdir: (parentDir: string, name: string) => Promise<void>
  trash: (path: string) => Promise<void>
  pasteInto: (destDir: string) => Promise<void>
  moveInto: (src: string, destDir: string) => Promise<void>
}

export const useExplorer = create<ExplorerState>((set, get) => ({
  columns: [],
  selectedByCol: {},
  previewPath: null,
  clipboard: null,
  refreshToken: 0,
  error: null,
  pinnedFolders: JSON.parse(localStorage.getItem('pinnedFolders') ?? '[]') as string[],
  starredFolders: JSON.parse(localStorage.getItem('starredFolders') ?? '[]') as string[],
  viewMode: (localStorage.getItem('viewMode') ?? 'columns') as 'columns' | 'grid',
  gridZoom: parseInt(localStorage.getItem('gridZoom') ?? '2', 10),
  pathViewMode: (localStorage.getItem('pathViewMode') ?? 'bubbles') as 'bubbles' | 'text',
  splitMode: localStorage.getItem('splitMode') === 'true',
  rightViewMode: (localStorage.getItem('rightViewMode') ?? 'columns') as 'columns' | 'grid',
  consoleOpen: localStorage.getItem('consoleOpen') === 'true',
  consoleHeight: parseInt(localStorage.getItem('consoleHeight') ?? '220', 10),

  init: async () => {
    const home = await window.fsApi.homeDir()
    set({ columns: [home], selectedByCol: {}, previewPath: null })
  },

  selectEntry: (colIndex, entry) => {
    const { columns } = get()
    const dirPath = columns[colIndex]
    if (!dirPath) return
    // truncate deeper columns + their selections
    const nextColumns = columns.slice(0, colIndex + 1)
    const nextSelected: Record<string, string> = {}
    for (const c of nextColumns) if (get().selectedByCol[c]) nextSelected[c] = get().selectedByCol[c]!
    nextSelected[dirPath] = entry.path

    if (entry.isDir) {
      set({ columns: [...nextColumns, entry.path], selectedByCol: nextSelected, previewPath: null })
    } else {
      set({ columns: nextColumns, selectedByCol: nextSelected, previewPath: entry.path })
    }
  },

  copyToClipboard: (path) => set({ clipboard: { path, op: 'copy' } }),
  refresh: () => set((s) => ({ refreshToken: s.refreshToken + 1 })),
  setError: (msg) => set({ error: msg }),

  pinFolder: (path) => {
    const next = [...new Set([...get().pinnedFolders, path])]
    localStorage.setItem('pinnedFolders', JSON.stringify(next))
    set({ pinnedFolders: next })
  },

  unpinFolder: (path) => {
    const next = get().pinnedFolders.filter((p) => p !== path)
    localStorage.setItem('pinnedFolders', JSON.stringify(next))
    set({ pinnedFolders: next })
  },

  starFolder: (path) => {
    const next = [...new Set([...get().starredFolders, path])]
    localStorage.setItem('starredFolders', JSON.stringify(next))
    set({ starredFolders: next })
  },

  unstarFolder: (path) => {
    const next = get().starredFolders.filter((p) => p !== path)
    localStorage.setItem('starredFolders', JSON.stringify(next))
    set({ starredFolders: next })
  },

  navigateTo: (targetPath) => {
    const { columns } = get()
    const home = columns[0]
    if (!home) return

    if (targetPath === home) {
      set({ columns: [home], selectedByCol: {}, previewPath: null })
      return
    }

    if (!targetPath.startsWith(home + '/')) return

    const parts = targetPath.slice(home.length + 1).split('/')
    const newColumns: string[] = [home]
    const newSelected: Record<string, string> = {}
    let current = home
    for (const part of parts) {
      const child = current + '/' + part
      newSelected[current] = child
      newColumns.push(child)
      current = child
    }
    set({ columns: newColumns, selectedByCol: newSelected, previewPath: null })
  },

  setViewMode: (mode) => {
    localStorage.setItem('viewMode', mode)
    set({ viewMode: mode })
  },

  setGridZoom: (level) => {
    const clamped = Math.max(1, Math.min(10, level))
    localStorage.setItem('gridZoom', String(clamped))
    set({ gridZoom: clamped })
  },

  togglePathViewMode: () => {
    const current = get().pathViewMode
    const next = current === 'bubbles' ? 'text' : 'bubbles'
    localStorage.setItem('pathViewMode', next)
    set({ pathViewMode: next })
  },

  toggleSplitMode: () => {
    const current = get().splitMode
    localStorage.setItem('splitMode', String(!current))
    set({ splitMode: !current })
  },

  setRightViewMode: (mode) => {
    localStorage.setItem('rightViewMode', mode)
    set({ rightViewMode: mode })
  },

  toggleConsole: () => {
    const next = !get().consoleOpen
    localStorage.setItem('consoleOpen', String(next))
    set({ consoleOpen: next })
  },

  setConsoleHeight: (h) => {
    const clamped = Math.max(100, Math.min(600, h))
    localStorage.setItem('consoleHeight', String(clamped))
    set({ consoleHeight: clamped })
  },

  rename: async (path, newName) => {
    try {
      await window.fsApi.rename(path, newName)
      get().refresh()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  mkdir: async (parentDir, name) => {
    try {
      await window.fsApi.mkdir(parentDir, name)
      get().refresh()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  trash: async (path) => {
    try {
      await window.fsApi.trash(path)
      if (get().previewPath === path) set({ previewPath: null })
      get().refresh()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  pasteInto: async (destDir) => {
    const clip = get().clipboard
    if (!clip) return
    try {
      await window.fsApi.copy(clip.path, destDir)
      get().refresh()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  moveInto: async (src, destDir) => {
    try {
      await window.fsApi.move(src, destDir)
      get().refresh()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },
}))

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
