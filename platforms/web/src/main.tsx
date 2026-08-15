import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, type AppEnv } from '@muralink/app'
import { CLOUD_ORIGIN, getAccountToken } from './account.ts'
import { installCloudVault } from './cloudVault.ts'
import { installServerVault, probeServer } from './serverVault.ts'
import { AccountDock } from './AccountDock.tsx'

// Register the cloud module spaces BEFORE render when an account token is
// already stored, so the calendar's first load merges in the account's cloud
// events. AccountDock validates the token afterwards and drops it if stale.
const stored = getAccountToken()
if (stored) installCloudVault(stored, CLOUD_ORIGIN)

// Self-hosted mode: when a core is answering on this same origin, module data
// belongs in ITS database, not in this browser. Without this the instance you
// deployed holds nothing and every device sees a different, private copy.
//
// 'auto' (default) probes; 'on' assumes a core (skips the round trip on a box
// you already know); 'off' keeps the pure browser-local build.
//   VITE_MURALINK_SERVER_SPACES=auto|on|off
//
// Skipped when a cloud account is linked: both vaults claim the space id
// 'orchester', and an instance is either its own server or a client of the
// hosted one.
const serverSpaces = (import.meta.env['VITE_MURALINK_SERVER_SPACES'] as string | undefined) ?? 'auto'
const apiToken = (import.meta.env['VITE_HARDSALON_TOKEN'] as string | undefined) ?? 'dev-token'
if (!stored && serverSpaces !== 'off') {
  // Deliberately not awaited: a slow or absent core must never delay first
  // paint. The stores reload when the space lands, a moment later.
  void (async () => {
    if (serverSpaces === 'on' || (await probeServer())) installServerVault(apiToken)
  })()
}

// Web env: the BASE app stays same-origin '/api' (the frontend server proxies
// to the LOCAL core), no orchester connection. The account layer above adds the
// cloud spaces on top; the account avatar lives in the dock's lower section.
const env: AppEnv = {
  platform: 'web',
  apiBaseUrl: '',
  apiToken: import.meta.env['VITE_HARDSALON_TOKEN'] ?? 'dev-token',
  hasOrchester: false,
  dockItems: [{ type: 'slot', id: 'mural-account', bottom: true, content: <AccountDock /> }],
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App env={env} />
  </StrictMode>,
)
