// A storage space is one place an item can live: this device (IndexedDB), a
// company server (orchester core over HTTP), or the cloud backup (tunnel,
// client-side encrypted). Every item lives in exactly ONE space, recorded on
// the item as `spaceId`, so edits and deletes always route back to the right
// place. Generalized from the calendar module's storage targets.

export type SpaceId = string // 'local' | 'orchester' | 'tunnel' | custom

// The minimum shape a spaced item must have. `spaceId` is runtime-only
// metadata stamped on reads — never persisted inside a space.
export interface SpaceEntity {
  id: string
  updatedAt?: string
  spaceId?: SpaceId
}

// Optional list filter. Spaces that ignore a field simply return everything;
// callers must not rely on server-side filtering for correctness.
export interface SpaceQuery {
  from?: string // ISO — range start (calendar-style overlap)
  to?: string // ISO — range end
  text?: string
  limit?: number
}

export interface StorageSpace<T extends SpaceEntity> {
  id: SpaceId
  label: string
  // True when the space works with no network. At least one local space stays
  // registered per collection so the UI never goes blank offline.
  local: boolean
  // Read-only spaces (e.g. a CRM adapter) reject create/update/remove.
  readonly?: boolean
  list(query?: SpaceQuery): Promise<T[]>
  create(item: T): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T | void>
  remove(id: string): Promise<void>
}
