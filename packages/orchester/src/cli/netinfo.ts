// Best-effort LAN IPv4 of this machine, for showing the address peers/browsers
// use to reach the frontend. Falls back to localhost.

import { networkInterfaces } from 'node:os'

export function localIp(): string {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    for (const n of iface ?? []) {
      if (n.family === 'IPv4' && !n.internal) return n.address
    }
  }
  return 'localhost'
}
