// ContactsAdapter — the contract an external platform implements so its own
// customer/client records show up inside Mural's contacts module.
//
// Design goals (DX-first — the integrating company owns a copy of this repo):
//   1. Minimum to implement: `list` and `search` against any JSON endpoint.
//      Everything else has a working default.
//   2. Read-only by default: your platform stays the source of truth. Set
//      `readonly: false` and implement create/update/remove only if you want
//      Mural to write back.
//   3. Map whatever subset of YContact you have — only id/name/createdAt are
//      required; use `externalId` + `source` for provenance and `custom` for
//      fields Mural has no column for.
//
// Register it and the contacts UI gains your platform as a source:
//
//   import { registerSpace } from '@muralink/spaces'   // or from '@muralink/embed'
//   registerSpace('contacts', myAdapter)

import type { StorageSpace } from '@muralink/spaces'
import type { YContact } from './types.ts'

export interface ContactsSearchQuery {
  text?: string
  limit?: number
  /** Opaque pagination cursor from a previous result page. */
  cursor?: string
}

export interface ContactsSearchResult {
  items: YContact[]
  /** Present when there are more pages. */
  nextCursor?: string
}

export interface ContactsAdapter extends StorageSpace<YContact> {
  /** Server-side search — called with the debounced text the user types. */
  search(query: ContactsSearchQuery): Promise<ContactsSearchResult>
  /** Deep link into your platform ("open in CRM"). */
  externalUrl?(contact: YContact): string | undefined
}

// Helper for the common case: a read-only adapter over two fetch functions.
// `create/update/remove` reject with a clear message; `list` delegates to
// `search` so the merged store view works without extra code.
export function makeReadonlyContactsAdapter(cfg: {
  id: string
  label: string
  search: (query: ContactsSearchQuery) => Promise<ContactsSearchResult>
  externalUrl?: (contact: YContact) => string | undefined
}): ContactsAdapter {
  const reject = () =>
    Promise.reject(new Error(`contacts space "${cfg.id}" is read-only — edit in the source platform`))
  return {
    id: cfg.id,
    label: cfg.label,
    local: false,
    readonly: true,
    search: cfg.search,
    externalUrl: cfg.externalUrl,
    async list(query) {
      const page = await cfg.search({ text: query?.text, limit: query?.limit })
      // Stamp origin so the store routes interactions back here.
      return page.items.map((c) => ({ ...c, spaceId: cfg.id }))
    },
    create: reject,
    update: reject,
    remove: () => reject().then(() => undefined),
  }
}
