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
