# @muralink/spaces

Storage spaces for local-first modules. Every item (note, contact, event,
reminder) lives in exactly **one** space:

- **local** — IndexedDB on this device. Default, offline, zero config.
- **company server** — an Mural orchester instance over HTTP (`makeHttpSpace`).
- **cloud backup** — encrypted tunnel space (client-side AES-GCM).

The registry is per-collection: modules register their local space, hosts
inject remote ones. Stores read every active space and merge (per-space
failure isolation); writes route back to the item's own space; `moveItem`
relocates an item between spaces.

```ts
import { registerSpace, makeHttpSpace } from '@muralink/spaces'

registerSpace('notes', makeHttpSpace({
  baseUrl: '/elio', token, path: '/api/notes', id: 'orchester', label: 'Servidor',
}))
```

Part of the [Mural platform](https://github.com/eliohq). MIT.
