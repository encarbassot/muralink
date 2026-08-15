import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TunnelApp } from '@muralink/app/tunnel'
import { TunnelDashboard } from '@muralink/app/tunnel-dashboard'

// The Tunnel serves this one SPA. Two faces, picked by path:
//   /s/:token → TunnelApp        — anonymous guest, password-gated folder share.
//   anything else (e.g. /) → TunnelDashboard — the multitenant account panel:
//     email+password login, then the user's instances (online / last-seen).
const isGuestShare = /^\/s\/[^/?#]+/.test(window.location.pathname)

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    {isGuestShare ? <TunnelApp /> : <TunnelDashboard />}
  </StrictMode>,
)
