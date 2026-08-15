// Daemon entry point. Constructs the Orchester, registers the default services,
// and serves the control socket. Run via `npm -w @muralink/orchester run daemon`
// or the `orchesterd` bin, or spawned automatically by OrchesterClient.ensureDaemon().

import { Orchester } from './orchester'
import { buildDefaultServices } from './services/index'
import { startDaemon } from './daemon'
import { ShareManager } from './shares'
import { paths } from './paths'

async function main(): Promise<void> {
  const orchester = new Orchester()
  for (const svc of buildDefaultServices(orchester)) orchester.register(svc)
  const shares = new ShareManager(orchester)

  let daemon
  try {
    daemon = await startDaemon(orchester, shares)
  } catch (err) {
    console.error(String(err))
    process.exit(1)
  }

  console.log(`[orchester] daemon listening on ${paths.socket}`)
  console.log(`[orchester] services: ${orchester.getStatus().map((s) => s.id).join(', ')}`)

  // Unattended boot: a server instance has nobody to press "start" in the TUI.
  // ELIO_AUTOSTART is written by the deploy wizard into the systemd env file;
  // absent (a desktop/dev run) nothing starts on its own, as before. Order is
  // the list's order — nas before core so the core sees ELIO_NAS_ROOT.
  const autostart = (process.env['ELIO_AUTOSTART'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const id of autostart) {
    if (!orchester.has(id)) {
      console.warn(`[orchester] autostart: no such service "${id}"`)
      continue
    }
    // Sequential, and a failure never aborts the rest: a box that cannot mount
    // storage should still come up with a reachable frontend saying so.
    await orchester.start(id)
    const state = orchester.getStatus().find((s) => s.id === id)
    console.log(`[orchester] autostart ${id}: ${state?.status}${state?.error ? ` — ${state.error}` : ''}`)
  }

  const shutdown = async (): Promise<void> => {
    console.log('[orchester] shutting down…')
    await orchester.stopAll()
    await daemon.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

void main()
