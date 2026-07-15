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
  id: 'hair-saloon',
  name: 'HardSalon',
  locale: 'es-ES',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  workingHours: {
    start: '09:00',
    end: '20:00',
    days: [1, 2, 3, 4, 5, 6], // Mon–Sat
  },
  slotDurationMinutes: 30,
}

export default config
