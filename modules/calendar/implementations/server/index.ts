export { schema, migrateCalendar } from './schema.ts'
export { createCalendarRouter } from './routes.ts'
export type { CalendarWriteHooks } from './routes.ts'
export * from './queries.ts'

// Appointments (booking on top of the calendar; own tables + router)
export { schema as appointmentsSchema } from './appointments/schema.ts'
export { createAppointmentsRouter } from './appointments/routes.ts'

// Google Calendar two-way sync (optional; orchester wires it in when
// GOOGLE_CLIENT_ID/SECRET are configured).
export { googleConfig, type GoogleConfig } from './google/config.ts'
export { initGoogleSchema, isConnected as isGoogleConnected } from './google/store.ts'
export { createGoogleRouter } from './google/routes.ts'
export { startPoller as startGoogleSync, syncOnce as googleSyncOnce, googleWriteHooks } from './google/sync.ts'
