// Local-first prepared-message persistence. One always-saved draft per contact
// (id `prep-<contactId>`), autosaved with a debounce so typing never loses
// work and never rewrites the contact row. Separate IndexedDB database
// (`elio-contacts-prepared`): makeIdbSpace opens with a fixed version, so a
// new object store cannot be added to the existing `elio-contacts` DB.

import { create } from 'zustand'
import { registerSpace, makeIdbSpace, listMerged, spaceFor } from '@muralink/spaces'
import type { YPreparedMessage } from '../../types.ts'
import { preparedMessageId } from '../../types.ts'

const COLLECTION = 'prepared-messages'

registerSpace(
  COLLECTION,
  makeIdbSpace<YPreparedMessage>({ dbName: 'elio-contacts-prepared', store: 'prepared' }),
)

const DEBOUNCE_MS = 600
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface PreparedState {
  // Keyed by contactId — the panel and the AI tool both read through this map.
  byContact: Record<string, YPreparedMessage | undefined>
  load: (contactId: string) => Promise<YPreparedMessage | undefined>
  /** Debounced upsert — UI typing path. */
  save: (contactId: string, body: string) => void
  /** Immediate upsert — the AI tool path and flush-on-blur. */
  saveNow: (contactId: string, body: string) => Promise<YPreparedMessage | undefined>
}

export const usePreparedMessage = create<PreparedState>((set, get) => ({
  byContact: {},

  async load(contactId) {
    const all = await listMerged<YPreparedMessage>(COLLECTION, ['local'])
    const msg = all.find((m) => m.contactId === contactId)
    set((s) => ({ byContact: { ...s.byContact, [contactId]: msg } }))
    return msg
  },

  save(contactId, body) {
    // Optimistic local state so the textarea and the chat see the same value.
    const now = new Date().toISOString()
    set((s) => ({
      byContact: {
        ...s.byContact,
        [contactId]: {
          id: preparedMessageId(contactId),
          contactId,
          body,
          updatedAt: now,
          ...(s.byContact[contactId]?.spaceId ? { spaceId: s.byContact[contactId]!.spaceId } : {}),
        },
      },
    }))
    const prev = saveTimers.get(contactId)
    if (prev) clearTimeout(prev)
    saveTimers.set(
      contactId,
      setTimeout(() => {
        saveTimers.delete(contactId)
        void get().saveNow(contactId, get().byContact[contactId]?.body ?? body)
      }, DEBOUNCE_MS),
    )
  },

  async saveNow(contactId, body) {
    const existing = get().byContact[contactId]
    const space = spaceFor<YPreparedMessage>(COLLECTION, existing, 'local')
    if (!space) return undefined
    const id = preparedMessageId(contactId)
    const msg: YPreparedMessage = { id, contactId, body, updatedAt: new Date().toISOString() }
    // Deterministic id + idb `put` semantics → create doubles as upsert; the
    // http space needs update-after-create, so try update first when known.
    const saved = existing
      ? ((await space.update(id, msg)) ?? (await space.create(msg)))
      : await space.create(msg)
    set((s) => ({ byContact: { ...s.byContact, [contactId]: saved } }))
    return saved
  },
}))
