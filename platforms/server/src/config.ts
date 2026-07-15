import fs from 'fs'
import path from 'path'

export interface WorkingHours {
  start: string   // 'HH:MM'
  end: string     // 'HH:MM'
  days: number[]  // 0=Sun … 6=Sat
}

export interface InstanceConfig {
  id: string
  name: string
  workingHours: WorkingHours
  slotDurationMinutes: number
  nas?: { enabled: boolean; rootPath?: string }
}

const DEFAULT_CONFIG: InstanceConfig = {
  id: 'elio-instance',
  name: 'Mural Instance',
  workingHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  slotDurationMinutes: 30,
}

export function loadInstanceConfig(): InstanceConfig {
  const configPath = process.env['ELIO_INSTANCE_CONFIG']
  if (!configPath) return DEFAULT_CONFIG
  // Resolve relative to process.cwd() so it works regardless of which directory
  // the server is launched from (npm workspace scripts change cwd to the package dir).
  const resolved = path.resolve(process.cwd(), configPath)
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf-8')) as InstanceConfig
  } catch {
    console.warn(`Could not load instance config from ${resolved} — using defaults`)
    return DEFAULT_CONFIG
  }
}
