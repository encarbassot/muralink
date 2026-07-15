import axios from 'axios'
import type { AppEnv } from '../env.ts'

// Shared API token (mutable — set by configureApi at mount). Also appended as
// ?token= to direct browser GETs (file serve / downloads) where an
// Authorization header can't be sent. ESM live binding: importers see updates.
export let API_TOKEN = 'dev-token'

// Absolute origin for direct (non-axios) browser GETs like file serve / <img>.
// '' for web (same-origin); absolute for electron.
export let API_ORIGIN = ''

// Single axios client. baseURL + token are configured per platform at startup
// via configureApi(env), before the app renders.
export const api = axios.create({ baseURL: '/api' })

export function configureApi(env: AppEnv): void {
  API_TOKEN = env.apiToken
  API_ORIGIN = env.apiBaseUrl ? env.apiBaseUrl.replace(/\/$/, '') : ''
  api.defaults.baseURL = `${API_ORIGIN}/api`
  api.defaults.headers.common['Authorization'] = `Bearer ${API_TOKEN}`
}
