// attendance module manifest. Team scheduling + clock-in/out + vacation
// requests, layered on modules/employees for identity — the "quedar con
// amigos" pattern applied to a person's own working hours: see your
// colleagues' schedule, self-adjust your own around it.

import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'attendance',
  version: '0.0.0',
  dependencies: ['employees'],
  types: ['YAttendanceEntry', 'YCalendarType', 'YVacationRequest', 'YAttendanceAvailability'],
  views: [
    {
      id: 'attendance-team-calendar',
      platforms: ['web'],
      sizes: ['3x3'],
      component: './implementations/web/views/TeamCalendar',
    },
    {
      id: 'attendance-clock',
      platforms: ['web', 'extension'],
      sizes: ['1x1', '2x2'],
      component: './implementations/web/views/ClockWidget',
    },
    {
      id: 'attendance-my-shift',
      platforms: ['web'],
      sizes: ['2x3', '3x3'],
      component: './implementations/web/views/MyShiftEditor',
    },
    {
      id: 'attendance-vacation',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/VacationRequests',
    },
  ],
  platforms: ['web', 'extension', 'local-server'],
}

export default manifest
