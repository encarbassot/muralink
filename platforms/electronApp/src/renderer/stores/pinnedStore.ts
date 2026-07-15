/**
 * pinnedStore — multi-level pin system for the bottom dock.
 *
 * Level 1: timed pin — shows a countdown ring. Expires after `durationMs`.
 * Level 2: permanent pin — no expiry.
 * Levels are configurable; user can add more and set durations.
 *
 * Sort order in dock:
 *   1. Level 2 (permanent) — leftmost
 *   2. Level 1+ (timed) — sorted by time remaining descending
 *      (most time left = left, about to expire = right)
 */

import { create } from 'zustand'

export interface PinLevel {
  level: number
  durationMs: number | null  // null = permanent
  label: string              // e.g. "1 week", "Permanent"
}

export interface PinnedItem {
  id: string
  /** For type 'file': filesystem path. For type 'layout': layoutId. */
  path: string
  label: string
  icon: string
  level: number
  pinnedAt: number   // Date.now() when pinned / last reset
  type?: 'file' | 'layout'  // defaults to 'file' for existing items
}

const DEFAULT_LEVELS: PinLevel[] = [
  { level: 1, durationMs: 7 * 24 * 60 * 60 * 1000, label: '1 week' },
  { level: 2, durationMs: null, label: 'Permanent' },
]

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Computed helpers (used by components, exported for testing) ───────────────

/** ms remaining for a timed pin. Returns null if permanent. */
export function msRemaining(item: PinnedItem, levels: PinLevel[]): number | null {
  const levelDef = levels.find((l) => l.level === item.level)
  if (!levelDef || levelDef.durationMs === null) return null
  return Math.max(0, item.pinnedAt + levelDef.durationMs - Date.now())
}

/** 0–1 fraction of lifetime remaining. 1 = just pinned, 0 = expired. */
export function lifetimeFraction(item: PinnedItem, levels: PinLevel[]): number {
  const levelDef = levels.find((l) => l.level === item.level)
  if (!levelDef || levelDef.durationMs === null) return 1
  const elapsed = Date.now() - item.pinnedAt
  return Math.max(0, Math.min(1, 1 - elapsed / levelDef.durationMs))
}

/** Human-readable remaining time: "6d 4h", "2h 30m", "45m" */
export function formatRemaining(ms: number): string {
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

/** Sorted items: permanent first, then timed sorted by most-remaining first. */
export function sortedPins(items: PinnedItem[], levels: PinLevel[]): PinnedItem[] {
  return [...items].sort((a, b) => {
    // Higher level = more permanent = goes left
    if (a.level !== b.level) return b.level - a.level
    // Same level: most time remaining = left
    const msA = msRemaining(a, levels) ?? Infinity
    const msB = msRemaining(b, levels) ?? Infinity
    return msB - msA
  })
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface PinnedState {
  items: PinnedItem[]
  levels: PinLevel[]

  pinItem(path: string, label: string, icon?: string, level?: number, type?: 'file' | 'layout'): void
  isPinned(path: string, type?: 'file' | 'layout'): boolean
  unpinItem(id: string): void
  setItemLevel(id: string, level: number): void
  resetItemTimer(id: string): void
  updateLevels(levels: PinLevel[]): void
}

let idSeq = 0

export const usePinned = create<PinnedState>((set, get) => ({
  items: loadState<PinnedItem[]>('pinnedItems_v2', []),
  levels: loadState<PinLevel[]>('pinLevels_v2', DEFAULT_LEVELS),

  pinItem(path, label, icon = '📁', level, type = 'file') {
    const { items, levels } = get()
    if (items.some((i) => i.path === path && (i.type ?? 'file') === type)) return
    const defaultLevel = Math.min(...levels.map((l) => l.level))
    const item: PinnedItem = {
      id: `pin-${Date.now()}-${++idSeq}`,
      path,
      label,
      icon,
      level: level ?? defaultLevel,
      pinnedAt: Date.now(),
      type,
    }
    const next = [...items, item]
    save('pinnedItems_v2', next)
    set({ items: next })
  },

  isPinned(path, type = 'file') {
    return get().items.some((i) => i.path === path && (i.type ?? 'file') === type)
  },

  unpinItem(id) {
    const next = get().items.filter((i) => i.id !== id)
    save('pinnedItems_v2', next)
    set({ items: next })
  },

  setItemLevel(id, level) {
    const next = get().items.map((i) =>
      i.id === id ? { ...i, level, pinnedAt: Date.now() } : i,
    )
    save('pinnedItems_v2', next)
    set({ items: next })
  },

  resetItemTimer(id) {
    const next = get().items.map((i) =>
      i.id === id ? { ...i, pinnedAt: Date.now() } : i,
    )
    save('pinnedItems_v2', next)
    set({ items: next })
  },

  updateLevels(levels) {
    save('pinLevels_v2', levels)
    set({ levels })
  },
}))
