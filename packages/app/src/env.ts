// AppEnv — the per-platform environment injected into the shared app.
// Each platform (web, electron) mounts <App env={...} /> with its own values.
// The app reads these to talk to the right API and to decide which surfaces to
// show (e.g. the orchester view only when a unix connection to the orchester
// core is present — i.e. on the desktop).

import { createContext, useContext } from 'react'

export type Platform = 'web' | 'electron' | 'tunnel'

// A relayed guest's privilege over a shared folder. Undefined for the instance
// owner (web/electron), who has full access. Mirrors the host role gate — the
// frontend only hides controls; the core stays the authority.
export type GuestRole = 'viewer' | 'editor' | 'admin'

export interface AppEnv {
  platform: Platform
  // Base URL for the core API. '' = same-origin '/api' (web, behind the proxy).
  // Electron passes an absolute URL (e.g. http://localhost:3001). The tunnel
  // guest passes the per-share relay base (e.g. https://tunnel/s/<token>).
  apiBaseUrl: string
  apiToken: string
  // True when this platform has a live unix connection to the orchester core.
  // Gates the orchester view (desktop only).
  hasOrchester: boolean
  // Set only on the tunnel guest mount — limits which storage controls show.
  role?: GuestRole
}

export const defaultEnv: AppEnv = {
  platform: 'web',
  apiBaseUrl: '',
  apiToken: 'dev-token',
  hasOrchester: false,
}

// Storage capabilities for a role. Owner (no role) gets everything.
export function capabilitiesFor(role: GuestRole | undefined): { write: boolean; del: boolean } {
  if (!role) return { write: true, del: true }
  if (role === 'viewer') return { write: false, del: false }
  if (role === 'editor') return { write: true, del: false }
  return { write: true, del: true } // admin
}

const AppEnvContext = createContext<AppEnv>(defaultEnv)

export const AppEnvProvider = AppEnvContext.Provider

export function useAppEnv(): AppEnv {
  return useContext(AppEnvContext)
}
