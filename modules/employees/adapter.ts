// EmployeesAdapter — the contract an external platform implements so its own
// staff directory shows up inside Mural's employees module. Same shape as
// modules/contacts/adapter.ts: employees are frequently the SAME identity a
// client's own auth system already manages (see modules/attendance's "Auth
// federada" for how login ties back to this roster), so most integrators
// plug a read-only adapter in rather than migrating anything.
//
// Design goals (DX-first — the integrating company owns a copy of this repo):
//   1. Minimum to implement: `list` and `search` against any JSON endpoint.
//      Everything else has a working default.
//   2. Read-only by default: your platform stays the source of truth. Set
//      `readonly: false` and implement create/update/remove only if you want
//      Mural to write back.
//   3. Map whatever subset of YEmployee you have — id/name/role/active are
//      required; there is no `custom` bag here (YEmployee is a small,
//      already-optional-heavy shape), so unmapped fields are simply dropped.
//
// Register it and the employees UI gains your platform as a source:
//
//   import { registerSpace } from '@muralink/spaces'   // or from '@muralink/embed'
//   registerSpace('employees', myAdapter)

import type { StorageSpace } from '@muralink/spaces'
import type { YEmployee } from './types.ts'

export interface EmployeesSearchQuery {
  text?: string
  limit?: number
  /** Opaque pagination cursor from a previous result page. */
  cursor?: string
}

export interface EmployeesSearchResult {
  items: YEmployee[]
  /** Present when there are more pages. */
  nextCursor?: string
}

export interface EmployeesAdapter extends StorageSpace<YEmployee> {
  /** Server-side search — called with the debounced text the user types. */
  search(query: EmployeesSearchQuery): Promise<EmployeesSearchResult>
  /** Deep link into your platform ("open in HR system"). */
  externalUrl?(employee: YEmployee): string | undefined
}

// Helper for the common case: a read-only adapter over two fetch functions.
// `create/update/remove` reject with a clear message; `list` delegates to
// `search` so the merged store view works without extra code.
export function makeReadonlyEmployeesAdapter(cfg: {
  id: string
  label: string
  search: (query: EmployeesSearchQuery) => Promise<EmployeesSearchResult>
  externalUrl?: (employee: YEmployee) => string | undefined
}): EmployeesAdapter {
  const reject = () =>
    Promise.reject(new Error(`employees space "${cfg.id}" is read-only — edit in the source platform`))
  return {
    id: cfg.id,
    label: cfg.label,
    local: false,
    readonly: true,
    search: cfg.search,
    externalUrl: cfg.externalUrl,
    async list(query) {
      const page = await cfg.search({ text: query?.text, limit: query?.limit })
      // Stamp origin so a future employees store can route interactions back
      // here — same as contacts' adapter. YEmployee (types.ts, untouched by
      // this module) has no `spaceId` field yet, so the cast is explicit
      // rather than relying on excess-property inference.
      return page.items.map((e) => ({ ...e, spaceId: cfg.id }) as YEmployee)
    },
    create: reject,
    update: reject,
    remove: () => reject().then(() => undefined),
  }
}
