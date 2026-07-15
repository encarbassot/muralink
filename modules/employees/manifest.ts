import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'employees',
  version: '0.0.0',
  dependencies: [],
  types: ['YEmployee', 'YShift'],
  views: [
    {
      id: 'employee-list',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/EmployeeList',
    },
    {
      id: 'week-schedule',
      platforms: ['web'],
      sizes: ['3x3'],
      component: './implementations/web/views/WeekSchedule',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
