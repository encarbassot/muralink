import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'calendar',
  version: '0.0.0',
  dependencies: [],
  types: ['YCalendarEvent', 'YAvailabilitySlot', 'YAppointment', 'YService', 'YAvailableSlot'],
  views: [
    {
      id: 'calendar-widget',
      platforms: ['web', 'electron', 'extension'],
      sizes: ['1x1', '1x2', '2x1', '2x2', '2x3', '3x2', '3x3'],
      component: './implementations/web/views/CalendarWidget',
    },
    {
      id: 'calendar-week',
      platforms: ['web'],
      sizes: ['3x3'],
      component: './implementations/web/views/WeekView',
    },
    {
      id: 'calendar-week-mobile',
      platforms: ['web'],
      sizes: ['2x3', '3x3'],
      component: './implementations/web/views/WeekApp',
    },
    {
      id: 'calendar-day-strip',
      platforms: ['web'],
      sizes: ['1x2'],
      component: './implementations/web/views/DayStrip',
    },
    {
      id: 'appointments-list',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/AppointmentList',
    },
    {
      id: 'booking-widget',
      platforms: ['web'],
      sizes: ['1x2'],
      component: './implementations/web/views/BookingWidget',
    },
  ],
  platforms: ['web', 'electron', 'extension', 'local-server'],
}

export default manifest
