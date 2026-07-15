# @muralink/module-contacts

Local-first contacts: clients, basic info, and internal notes. Works fully
offline (IndexedDB) with no backend; add remote storage spaces to share, or an
**adapter** to surface your own platform's customers inside Mural.

- **Exposes:** `YContact` (built on `YEmail`, `YPhone` from `@muralink/types`)
- **Web:** `ContactsApp` (list + detail), `ContactList`, `ContactCard`, `useContacts`
- **Server:** `createContactsRouter` (Express + sqlite), mounted at `/api/contacts`
- **Platforms:** web, extension, local-server

## Integrating your platform's customers (ContactsAdapter)

If your product already has customers (a CRM, an ERP, a Rails app…), don't
migrate them — plug them in. Implement **one search endpoint** on your side and
register an adapter. Your platform stays the source of truth; Mural shows the
contacts read-only with a deep link back.

### 1. Expose an endpoint

Any JSON shape works — you map it. Example:

```
GET /api/elio/customers?q=<text>&limit=<n>
→ [{ "id": 42, "name": "Jane Doe", "email": "jane@x.com", "phone": "+34600111222" }]
```

### 2. Register the adapter

```ts
import { registerSpace } from '@muralink/embed' // or '@muralink/spaces'
import { makeJsonContactsAdapter } from '@muralink/module-contacts/web'

registerSpace('contacts', makeJsonContactsAdapter({
  id: 'bikehunter',
  label: 'Clientes',
  url: '/api/elio/customers',
  toContact: (r: any) => ({
    id: `bh-${r.id}`,
    name: r.name,
    email: r.email ? { address: r.email } : undefined,
    phone: r.phone ? { number: r.phone, countryCode: '' } : undefined,
    company: r.company,
    externalId: String(r.id),
    source: 'bikehunter',
    custom: { plan: r.plan_name },            // anything extra, shown as key → value
    createdAt: { iso: r.created_at, timezone: 'UTC' },
  }),
  externalUrl: (c) => `/apps/customers/${c.externalId}`, // "Abrir ↗" deep link
}))
```

That's it — the contacts UI now merges your customers with the user's local
contacts, marks them read-only with your label, and links back to your app.

### Write-back (optional)

The full `ContactsAdapter` contract is `StorageSpace<YContact>` + `search` +
`externalUrl?` (see [adapter.ts](./adapter.ts)). Implement
`create`/`update`/`remove` and drop `readonly` if you want Mural to write to
your platform too. `makeReadonlyContactsAdapter` is the shortcut for the
read-only case.

### Field mapping

Only `id`, `name`, `createdAt` are required on `YContact`. Optional:
`email`, `phone`, `notes`, `company`, `tags`, `avatarUrl`, `address`,
`externalId`, `source`, `custom` (free key → value record), `updatedAt`.
