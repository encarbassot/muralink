// Storage spaces for calendar events — thin back-compat shim over
// @muralink/spaces. The calendar pioneered the "N storage targets" pattern; it is
// now generalized for every module in @muralink/spaces, and events live in the
// 'events' collection there. Existing consumers keep the old provider names.

import type { YCalendarEvent } from '../../../types.ts'
import {
  type SpaceId,
  type StorageSpace,
  registerSpace,
  getSpace,
  listSpaces,
  stamp as stampItems,
} from '@muralink/spaces'

export const COLLECTION = 'events'

export type StoreId = SpaceId
export type StorageProvider = StorageSpace<YCalendarEvent>

export function registerProvider(p: StorageProvider): void {
  registerSpace(COLLECTION, p)
}

export function getProvider(id: StoreId): StorageProvider | undefined {
  return getSpace<YCalendarEvent>(COLLECTION, id)
}

export function listProviders(): StorageProvider[] {
  return listSpaces<YCalendarEvent>(COLLECTION)
}

export function stamp(id: StoreId, events: YCalendarEvent[]): YCalendarEvent[] {
  return stampItems(id, events)
}
