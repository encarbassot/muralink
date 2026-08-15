// Reference EmployeesAdapter over a generic JSON endpoint. Copy this file and
// change `toEmployee` + the URL to integrate any platform. Example: a Rails
// app exposing GET /api/elio/staff?q=<text>&limit=<n> returning
//   [{ "id": 7, "name": "Jane", "email": "j@x.com", "role": "manager" }]
//
// This is the file to hand to an integrating company's devs: implement one
// endpoint, map its fields, register the adapter — done. Mirrors
// modules/contacts/implementations/web/adapters/exampleJsonAdapter.ts exactly.

import type { YEmployee } from '../../../types.ts'
import {
  makeReadonlyEmployeesAdapter,
  type EmployeesAdapter,
  type EmployeesSearchQuery,
  type EmployeesSearchResult,
} from '../../../adapter.ts'

interface ExampleJsonConfig {
  id: string // space id, e.g. 'bikehunter'
  label: string // shown in the source switcher, e.g. 'Plantilla BikeHunter'
  /** Endpoint returning a JSON array of your staff records. */
  url: string
  /** Sent as Authorization: Bearer <token>, if your endpoint needs it. */
  token?: string
  /** Map one of your records to a YEmployee. */
  toEmployee: (record: unknown) => YEmployee
  /** Deep link to the record in your platform, e.g. `/staff/${id}`. */
  externalUrl?: (employee: YEmployee) => string | undefined
}

export function makeJsonEmployeesAdapter(cfg: ExampleJsonConfig): EmployeesAdapter {
  async function search(query: EmployeesSearchQuery): Promise<EmployeesSearchResult> {
    const params = new URLSearchParams()
    if (query.text) params.set('q', query.text)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.cursor) params.set('cursor', query.cursor)
    const res = await fetch(`${cfg.url}?${params}`, {
      headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : undefined,
    })
    if (!res.ok) throw new Error(`employees adapter "${cfg.id}" ${res.status}`)
    const body = (await res.json()) as unknown
    const records = Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])
    const nextCursor = Array.isArray(body) ? undefined : (body as { nextCursor?: string }).nextCursor
    return { items: records.map(cfg.toEmployee), nextCursor }
  }

  return makeReadonlyEmployeesAdapter({
    id: cfg.id,
    label: cfg.label,
    search,
    externalUrl: cfg.externalUrl,
  })
}
