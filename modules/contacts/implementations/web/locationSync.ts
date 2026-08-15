// Polls a linked contact's own instance for their currently-visible public
// locations, through the existing folder-share-relay transport (tunnel/docs/
// folder-share-relay.md) — no push, no presence. v1 sync = call this when the
// map/detail view opens, or on an interval; never in the background.

import type { YContact, YContactLocationCache } from '../../types.ts'
import { useContacts } from './contactsStore.ts'
import { useContactLocationCache } from './contactLocationCacheStore.ts'

export async function pollContactLocation(contact: YContact): Promise<YContactLocationCache | undefined> {
  const linked = contact.linkedAccount
  if (!linked) return undefined

  const update = useContacts.getState().update

  try {
    const res = await fetch(`${linked.tunnelUrl}/api/contacts/shared-locations`)
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      await update(contact.id, { linkedAccount: { ...linked, status: 'revoked' } })
      return undefined
    }
    if (!res.ok) return undefined

    const locations = await res.json()
    const now = new Date().toISOString()
    const entry: YContactLocationCache = { id: contact.id, contactId: contact.id, locations, fetchedAt: now }
    await useContactLocationCache.getState().save(entry)
    await update(contact.id, { linkedAccount: { ...linked, status: 'accepted', lastSyncedAt: now } })
    return entry
  } catch {
    // Offline or the contact's instance is down — local-first: keep the last
    // cached snapshot, don't flip status (transient, not a revocation).
    return useContactLocationCache.getState().byContact[contact.id]
  }
}
