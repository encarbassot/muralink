import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'appointments',
  version: '0.0.0',
  dependencies: ['contacts', 'calendar'],
  types: ['YAppointment', 'YService', 'YAvailableSlot'],
  views: [
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
  platforms: ['web', 'local-server'],
}

export default manifest
