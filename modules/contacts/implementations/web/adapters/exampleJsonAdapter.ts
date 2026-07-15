// Reference ContactsAdapter over a generic JSON endpoint. Copy this file and
// change `toContact` + the URL to integrate any platform. Example: a Rails app
// exposing GET /api/elio/customers?q=<text>&limit=<n> returning
//   [{ "id": 42, "name": "Jane", "email": "j@x.com", "phone": "+34600...", ... }]
//
// This is the file to hand to an integrating company's devs: implement one
// endpoint, map its fields, register the adapter — done.

import type { YContact } from '../../../types.ts'
import {
  makeReadonlyContactsAdapter,
  type ContactsAdapter,
  type ContactsSearchQuery,
  type ContactsSearchResult,
} from '../../../adapter.ts'

interface ExampleJsonConfig {
  id: string // space id, e.g. 'bikehunter'
  label: string // shown in the source switcher, e.g. 'Clientes BikeHunter'
  /** Endpoint returning a JSON array of your customer records. */
  url: string
  /** Sent as Authorization: Bearer <token>, if your endpoint needs it. */
  token?: string
  /** Map one of your records to a YContact. */
  toContact: (record: unknown) => YContact
  /** Deep link to the record in your platform, e.g. `/customers/${externalId}`. */
  externalUrl?: (contact: YContact) => string | undefined
}

export function makeJsonContactsAdapter(cfg: ExampleJsonConfig): ContactsAdapter {
  async function search(query: ContactsSearchQuery): Promise<ContactsSearchResult> {
    const params = new URLSearchParams()
    if (query.text) params.set('q', query.text)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.cursor) params.set('cursor', query.cursor)
    const res = await fetch(`${cfg.url}?${params}`, {
      headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : undefined,
    })
    if (!res.ok) throw new Error(`contacts adapter "${cfg.id}" ${res.status}`)
    const body = (await res.json()) as unknown
    const records = Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])
    const nextCursor = Array.isArray(body) ? undefined : (body as { nextCursor?: string }).nextCursor
    return { items: records.map(cfg.toContact), nextCursor }
  }

  return makeReadonlyContactsAdapter({
    id: cfg.id,
    label: cfg.label,
    search,
    externalUrl: cfg.externalUrl,
  })
}
