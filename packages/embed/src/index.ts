// @muralink/embed — the single public surface for embedding Mural into any app.
// Everything here is local-first and works fully offline (IndexedDB); no
// backend and no Mural account required. Remote storage spaces (your company's
// own Mural server, cloud backup) are opt-in via <MuralProvider spaces>.
// Import '@muralink/embed/theme.css' is handled by <MuralProvider>.

// ── The batteries-included workspace ─────────────────────────────────────────
export { MuralBoard } from './MuralBoard.tsx'
export type { MuralBoardProps } from './MuralBoard.tsx'
export { MuralProvider, useMuralUser, useMuralHasRemoteSpaces } from './MuralProvider.tsx'
export type { MuralProviderProps, MuralUser, MuralSpacesConfig } from './MuralProvider.tsx'

// ── The recursive bento dashboard (drag/resize widgets, nested sub-dashboards,
//    in-place + full-screen markdown). The full Mural frontend experience. ─────
export { MuralDashboard } from './dashboard/MuralDashboard.tsx'
export type { MuralDashboardProps } from './dashboard/MuralDashboard.tsx'

// ── Ready-to-mount module apps (each self-contained, local-first) ────────────
export { NotesApp as Notes, NotesCard, MarkdownEditor, useNotes } from '@muralink/module-notes/web'
export { RemindersApp as Reminders, useReminders } from '@muralink/module-reminders/web'
export { ContactsApp as Contacts, ContactList, ContactCard, useContacts, makeJsonContactsAdapter } from '@muralink/module-contacts/web'
export { makeReadonlyContactsAdapter } from '@muralink/module-contacts/adapter'
export type { ContactsAdapter, ContactsSearchQuery, ContactsSearchResult } from '@muralink/module-contacts/adapter'
export { CalendarBoard as Calendar } from './CalendarBoard.tsx'
export { CalendarApp, MonthView, WeekView, DayStrip, UpcomingView, useEvents, makeEvent } from '@muralink/module-calendar/web'
export type { CalendarMode } from '@muralink/module-calendar/web'

// ── Storage spaces — extend where items can live ─────────────────────────────
export {
  registerSpace,
  listSpaces,
  makeHttpSpace,
  makeIdbSpace,
} from '@muralink/spaces'
export type { StorageSpace, SpaceId, SpaceQuery, SpaceEntity } from '@muralink/spaces'

// ── Grid engine — build your own recursive dashboards ────────────────────────
export {
  BentoGrid,
  BentoCell,
  GridCanvas,
  GridCell,
  useGridLayout,
  useGridDrag,
  useGridRelocate,
  OccupancyMap,
  SlotFinder,
  DisplacementPlanner,
} from '@muralink/ui'
export type { BentoSize } from '@muralink/ui'

// ── Data types (the interoperability contract) ───────────────────────────────
export type { YContact } from '@muralink/module-contacts/types'
export type { YNote } from '@muralink/module-notes/types'
export type { YReminder } from '@muralink/module-reminders/types'
export type { YCalendarEvent } from '@muralink/module-calendar/web'
