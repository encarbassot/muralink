// attendance module types. A unified entry carries two independent timestamp
// halves — `planned` (agenda-style, set ahead of time) and `recorded`
// (start/stop clock-in, mirrors modules/tracker's YTimeEntry running = no
// `end`). At least one half must be present; that invariant is enforced in
// routes.ts, not the type, so a partial patch mid-write never fails a
// TypeScript check that has no runtime meaning.

import type { YDateTime, YDuration } from '@muralink/types'

export type CalendarTypeKind = 'work' | 'personal' | 'vacation' | 'sick' | 'other'

export interface YCalendarType {
  id: string
  employeeId?: string // undefined = calendario compartido (ej. festivos empresa)
  name: string
  kind: CalendarTypeKind
  color?: string
  // Costura para sync externo futuro (Google/Outlook) — sin implementar ahora
  externalProvider?: 'google' | 'outlook'
  externalCalendarId?: string
  syncEnabled: boolean
  createdAt: YDateTime
}

export interface YAttendanceEntry {
  id: string
  employeeId: string
  calendarTypeId: string
  planned?: { start: YDateTime; end: YDateTime }
  recorded?: { start: YDateTime; end?: YDateTime } // sin end = fichado, en curso
  vacationRequestId?: string // set cuando esta entrada nace de una solicitud aprobada
  note?: string
  createdBy: string
  updatedAt: string
  spaceId?: string
}

export type VacationRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type VacationRequestKind = 'vacation' | 'sick' | 'personal' | 'other'

export interface YVacationRequest {
  id: string
  employeeId: string
  kind: VacationRequestKind
  start: YDateTime
  end: YDateTime
  status: VacationRequestStatus
  reason?: string
  requestedBy: string
  decidedBy?: string
  decidedAt?: YDateTime
  decisionNote?: string
  attendanceEntryId?: string // set al aprobar (materializa una YAttendanceEntry)
  createdAt: YDateTime
  updatedAt: string
}

// Derivado, no persistido — para las vistas de equipo (free/busy sin exponer detalle)
export interface YAttendanceAvailability {
  employeeId: string
  start: YDateTime
  duration: YDuration
  busy: boolean
  source: 'planned' | 'recorded'
}
