// Shared plumbing for "spaced" module stores. Each module keeps its own
// zustand store (views select named keys like `s.notes`), but the space
// mechanics are identical everywhere: which spaces are active, which one
// receives new items, merged reads with per-space failure isolation, routing
// writes back to an item's space, and moving items between spaces. Semantics
// extracted from the calendar's eventsStore.

import type { SpaceEntity, SpaceId, SpaceQuery, StorageSpace } from './space'
import { getSpace, listSpaces } from './registry'

// ── Per-collection space preferences (persisted in localStorage) ─────────────

export interface SpacePrefs {
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
}

const activeKey = (collection: string) => `elio-${collection}-spaces`
const defaultKey = (collection: string) => `elio-${collection}-default-space`

export function loadPrefs(collection: string): SpacePrefs {
  let activeSpaces: SpaceId[] = ['local']
  try {
    const raw = localStorage.getItem(activeKey(collection))
    if (raw) activeSpaces = JSON.parse(raw) as SpaceId[]
  } catch {
    /* ignore */
  }
  const defaultSpace = localStorage.getItem(defaultKey(collection)) ?? 'local'
  return { activeSpaces, defaultSpace }
}

export function persistPrefs(collection: string, prefs: SpacePrefs): void {
  try {
    localStorage.setItem(activeKey(collection), JSON.stringify(prefs.activeSpaces))
    localStorage.setItem(defaultKey(collection), prefs.defaultSpace)
  } catch {
    /* ignore */
  }
}

// A default space must also be active (readable).
export function withDefault(prefs: SpacePrefs, id: SpaceId): SpacePrefs {
  const activeSpaces = prefs.activeSpaces.includes(id)
    ? prefs.activeSpaces
    : [...prefs.activeSpaces, id]
  return { activeSpaces, defaultSpace: id }
}

// Toggle a space on/off, never disabling the last one — a collection needs at
// least one readable space.
export function withToggled(prefs: SpacePrefs, id: SpaceId): SpacePrefs {
  const on = prefs.activeSpaces.includes(id)
  let activeSpaces = on
    ? prefs.activeSpaces.filter((s) => s !== id)
    : [...prefs.activeSpaces, id]
  if (activeSpaces.length === 0) activeSpaces = prefs.activeSpaces
  const defaultSpace = activeSpaces.includes(prefs.defaultSpace)
    ? prefs.defaultSpace
    : activeSpaces[0]!
  return { activeSpaces, defaultSpace }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

// Read every active registered space and merge. One failing space (e.g. the
// server is offline) must not blank the collection.
export async function listMerged<T extends SpaceEntity>(
  collection: string,
  activeSpaces: SpaceId[],
  query?: SpaceQuery,
): Promise<T[]> {
  const spaces = activeSpaces
    .map((id) => getSpace<T>(collection, id))
    .filter((s): s is StorageSpace<T> => !!s)
  const results = await Promise.all(
    spaces.map((s) =>
      s.list(query).catch((err) => {
        console.warn(`[spaces] "${collection}" space "${s.id}" list failed`, err)
        return [] as T[]
      }),
    ),
  )
  return results.flat()
}

// ── Writes ────────────────────────────────────────────────────────────────────

// The space that should receive a write for this item: its own space if it has
// one, else the collection default.
export function spaceFor<T extends SpaceEntity>(
  collection: string,
  item: T | undefined,
  defaultSpace: SpaceId,
): StorageSpace<T> | undefined {
  return getSpace<T>(collection, item?.spaceId ?? defaultSpace)
}

// Move an item between spaces: recreate it in the destination, drop the
// original. Server-backed spaces may mint a new id, so callers must swap the
// returned record in. Destination write happens first so a failure never
// loses the item.
export async function moveItem<T extends SpaceEntity>(
  collection: string,
  item: T,
  toSpace: SpaceId,
): Promise<T | null> {
  if (item.spaceId === toSpace) return null
  const dest = getSpace<T>(collection, toSpace)
  if (!dest || dest.readonly) return null
  const src = getSpace<T>(collection, item.spaceId ?? 'local')
  const created = await dest.create(item)
  await src?.remove(item.id)
  return created
}

// Writable spaces the user can pick as a save target for this collection.
export function writableSpaces<T extends SpaceEntity>(collection: string): StorageSpace<T>[] {
  return listSpaces<T>(collection).filter((s) => !s.readonly)
}
