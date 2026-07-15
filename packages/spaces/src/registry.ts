// Per-collection space registries. Each collection ('notes', 'contacts',
// 'events', 'reminders', …) has its own set of spaces: the module registers
// its local space, the host (MuralProvider, a platform, or the consuming app)
// injects remote ones before the module mounts.

import type { SpaceEntity, SpaceId, StorageSpace } from './space'

const registries = new Map<string, Map<SpaceId, StorageSpace<SpaceEntity>>>()

function forCollection(collection: string): Map<SpaceId, StorageSpace<SpaceEntity>> {
  let m = registries.get(collection)
  if (!m) {
    m = new Map()
    registries.set(collection, m)
  }
  return m
}

export function registerSpace<T extends SpaceEntity>(
  collection: string,
  space: StorageSpace<T>,
): void {
  forCollection(collection).set(space.id, space as StorageSpace<SpaceEntity>)
}

export function unregisterSpace(collection: string, id: SpaceId): void {
  forCollection(collection).delete(id)
}

export function getSpace<T extends SpaceEntity>(
  collection: string,
  id: SpaceId,
): StorageSpace<T> | undefined {
  return forCollection(collection).get(id) as StorageSpace<T> | undefined
}

export function listSpaces<T extends SpaceEntity>(collection: string): StorageSpace<T>[] {
  return [...forCollection(collection).values()] as StorageSpace<T>[]
}

// Stamp every item a space returns with its origin so the store can route
// later updates/deletes back to the right space.
export function stamp<T extends SpaceEntity>(id: SpaceId, items: T[]): T[] {
  return items.map((it) => ({ ...it, spaceId: id }))
}
