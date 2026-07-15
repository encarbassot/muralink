import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, type AppEnv } from '@muralink/app'

// Web env: same-origin '/api' (the frontend server proxies to the core),
// no orchester connection (browser). Styles are imported by @muralink/app.
const env: AppEnv = {
  platform: 'web',
  apiBaseUrl: '',
  apiToken: import.meta.env['VITE_HARDSALON_TOKEN'] ?? 'dev-token',
  hasOrchester: false,
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App env={env} />
  </StrictMode>,
)
