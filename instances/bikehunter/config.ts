// BikeHunter (Panot Mobility) — instance-level constants. Employee pinboard
// deployment: the orchester runs on the company's own EC2 next to their Rails
// app. Milestone 2 adds the public booking embed (appointments module), which
// is when workingHours/slots start to matter.

export interface InstanceConfig {
  id: string
  name: string
  locale: string
  timezone: string
  currency: string
  workingHours: {
    start: string // HH:MM, 24h
    end: string
    days: number[] // 0 = Sunday, 6 = Saturday
  }
  slotDurationMinutes: number
}

const config: InstanceConfig = {
  id: 'bikehunter',
  name: 'BikeHunter',
  locale: 'es-ES',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  workingHours: {
    start: '09:00',
    end: '19:00',
    days: [1, 2, 3, 4, 5], // Mon–Fri
  },
  slotDurationMinutes: 30,
}

export default config
