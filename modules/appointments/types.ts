import type { YDateTime, YDuration, YMoney } from '@muralink/types'

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no-show'

export interface YService {
  id: string
  name: string
  durationSeconds: number
  price?: YMoney
  description?: string
}

export interface YAppointment {
  id: string
  contactId: string
  serviceId: string
  start: YDateTime
  duration: YDuration
  status: AppointmentStatus
  notes?: string
  createdAt: YDateTime
}

export interface YAvailableSlot {
  start: YDateTime
  durationSeconds: number
}
