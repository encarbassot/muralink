import type { YPhone, YEmail, YDateTime } from '@muralink/types'

// A contact. Only `id`, `name` and `createdAt` are required — every other
// field is optional so external platforms (a CRM, an ERP, a Rails app) can map
// their own records onto it with whatever subset they have. Platform-specific
// data that has no field here goes in `custom`.
export interface YContact {
  id: string
  name: string
  phone?: YPhone
  email?: YEmail
  notes?: string
  company?: string
  tags?: string[]
  avatarUrl?: string
  address?: string
  // Provenance, for contacts that live in an external system (adapter spaces):
  // the id in that system and a short source label like 'bikehunter'.
  externalId?: string
  source?: string
  // Escape hatch for platform-specific fields the UI shows as key → value.
  custom?: Record<string, string | number | boolean>
  createdAt: YDateTime
  updatedAt?: string
  // Which storage space currently holds this contact (runtime-only, stamped
  // on read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}
