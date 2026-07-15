import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, type AppEnv } from '@muralink/app'

// Suppress the native context menu app-wide.
window.addEventListener('contextmenu', (e) => e.preventDefault())

// Electron env: the renderer is loaded locally (not behind the web-frontend
// proxy), so it talks to the core at an absolute URL. hasOrchester=true because
// the desktop has a unix connection to the orchester core (via the preload
// bridge) — this is what surfaces the orchester view, the one desktop extra.
const env: AppEnv = {
  platform: 'electron',
  apiBaseUrl: import.meta.env['VITE_ELIO_CORE_URL'] ?? 'http://localhost:3001',
  apiToken: import.meta.env['VITE_ELIO_API_TOKEN'] ?? 'dev-token',
  hasOrchester: true,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App env={env} />
  </StrictMode>,
)
