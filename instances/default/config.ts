// The instance every build falls back to.
//
// An instance is the one place a deployment says who it is: name, locale,
// money, working hours. No business logic lives here — modules provide that.
// Copy this folder, change the values, point the `@instance` alias at it
// (platforms/web/vite.config.ts and tsconfig.base.json) and you have your own.

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
  id: 'default',
  name: 'Muralink',
  locale: 'es-ES',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  workingHours: {
    start: '09:00',
    end: '18:00',
    days: [1, 2, 3, 4, 5], // Mon–Fri
  },
  slotDurationMinutes: 30,
}

export default config
