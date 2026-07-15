import type { YPhone, YEmail, YDateTime } from '@muralink/types'

export type EmployeeRole = 'stylist' | 'colorist' | 'nail-tech' | 'receptionist' | 'manager'

export interface YEmployee {
  id: string
  name: string
  role: EmployeeRole
  phone?: YPhone
  email?: YEmail
  color?: string
  active: boolean
  createdAt: YDateTime
}

export interface YShift {
  id: string
  employeeId: string
  date: string
  startTime: string
  endTime: string
  notes?: string
}
