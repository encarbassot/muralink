# @muralink/module-employees

Local-first staff roster and simple shift scheduling for service businesses
(salons, workshops…). Works fully offline with no backend; add remote storage
spaces to share, or an **adapter** to surface your own platform's staff
directory inside Mural.

- **Exposes:** `YEmployee`, `YShift` (built on `YPhone`, `YEmail`, `YDateTime` from `@muralink/types`)
- **Web:** `EmployeeList`, `WeekSchedule`
- **Server:** `createEmployeesRouter` (Express + sqlite), mounted at `/api/employees`
- **Platforms:** web, local-server

`YShift` (`date` + `startTime`/`endTime` strings) is a simple, vertical-specific
turno primitive tied to `EmployeeRole` (stylist, colorist, nail-tech…). It is
not migrated or deprecated — new integrations that need cross-team scheduling,
clock-in/out, and vacation requests instead install `modules/attendance`
(`dependencies: ['employees']`), which reuses `YEmployee` for identity and
layers its own richer entry model on top. Pick `YShift` for a single salon's
weekly board; pick `attendance` for "who else is working when I am" across a
team, with real clock-in/out and a vacation approval workflow.

## Integrating your platform's staff directory (EmployeesAdapter)

If your product already has employee accounts (an HR system, a Rails app's
`User` table…), don't migrate them — plug them in. Implement **one search
endpoint** on your side and register an adapter. Your platform stays the
source of truth; Mural shows the roster read-only with a deep link back.

### 1. Expose an endpoint

Any JSON shape works — you map it. Example:

```
GET /api/elio/staff?q=<text>&limit=<n>
→ [{ "id": 7, "name": "Jane Doe", "email": "jane@x.com", "role": "manager" }]
```

### 2. Register the adapter

```ts
import { registerSpace } from '@muralink/embed' // or '@muralink/spaces'
import { makeJsonEmployeesAdapter } from '@muralink/module-employees/web'

registerSpace('employees', makeJsonEmployeesAdapter({
  id: 'bikehunter',
  label: 'Plantilla BikeHunter',
  url: '/api/elio/staff',
  toEmployee: (r: any) => ({
    id: `bh-${r.id}`,
    name: r.name,
    role: r.role ?? 'receptionist',
    email: r.email ? { address: r.email } : undefined,
    phone: r.phone ? { number: r.phone, countryCode: '' } : undefined,
    active: r.active ?? true,
    createdAt: { iso: r.created_at, timezone: 'UTC' },
  }),
  externalUrl: (e) => `/apps/staff/${e.id}`, // "Abrir ↗" deep link
}))
```

That's it — the employees UI now shows your staff read-only with your label,
and links back to your app.

### Write-back (optional)

The full `EmployeesAdapter` contract is `StorageSpace<YEmployee>` + `search` +
`externalUrl?` (see [adapter.ts](./adapter.ts)). Implement
`create`/`update`/`remove` and drop `readonly` if you want Mural to write to
your platform too. `makeReadonlyEmployeesAdapter` is the shortcut for the
read-only case.

### Field mapping

`id`, `name`, `role`, `active`, `createdAt` are required on `YEmployee`.
Optional: `phone`, `email`, `color`. `EmployeeRole` is one of `'stylist' |
'colorist' | 'nail-tech' | 'receptionist' | 'manager'` — map your own roles
onto the closest fit (`attendance`'s `isManager()` check specifically reads
`role === 'manager'`, so that mapping matters if you install it).

### This same roster backs federated login

If you also install `modules/attendance`, the id this adapter assigns an
employee (`bh-${r.id}` above) is the same id `packages/multiuser`'s federated
auth route resolves a client token to — see `modules/attendance`'s README,
"Auth federada". Keep the id stable across both integrations.
