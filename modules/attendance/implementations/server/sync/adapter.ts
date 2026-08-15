// Seam for a future two-way sync with Google/Outlook calendars — deliberately
// a no-op today. `YCalendarType.externalProvider/externalCalendarId/syncEnabled`
// and the equivalent schema.ts columns are the persisted half of this seam; a
// future `implementations/server/google/` (config/oauth/client/sync/store +
// an outbox table), modeled 1:1 on modules/calendar/implementations/server/google/,
// replaces `noopExternalCalendarAdapter` without touching types.ts or the schema.

import type { YAttendanceEntry } from '../../../types.ts'

export interface ExternalCalendarAdapter {
  provider: 'google' | 'outlook'
  isEnabled(): boolean
  push(entry: YAttendanceEntry): Promise<{ externalId: string; etag?: string } | void>
  pull(since?: string): Promise<YAttendanceEntry[]>
}

export function noopExternalCalendarAdapter(provider: 'google' | 'outlook'): ExternalCalendarAdapter {
  return {
    provider,
    isEnabled: () => false,
    push: async () => {},
    pull: async () => [],
  }
}
