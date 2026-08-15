#!/usr/bin/env node
// Single entry point for an elio instance (PATH-PREP stub).
//
// Both ways of running the project funnel through here:
//   Option A — clone & run by console: `node scripts/elio.mjs`
//   Option B — the Electron app shells out to this same path on first launch.
//
// Responsibilities (today): boot the orchester daemon; on first run (no
// ~/.elio/instance.json) print where the wizard will go and exit cleanly.
// The interactive wizard itself is intentionally NOT implemented yet — this
// just lays the rails so the next round drops it in without restructuring.

// Run via tsx (see root `npm start`) so the TS package import resolves.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isFirstRun, paths } from '@elio/orchester'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

async function main() {
  if (isFirstRun()) {
    console.log('────────────────────────────────────────────')
    console.log(' elio — first run')
    console.log('────────────────────────────────────────────')
    console.log(' No instance configured yet.')
    console.log(` The setup wizard will live here and write ${paths.instance}.`)
    console.log(' (wizard not implemented yet — path-prep only)')
    console.log('')
    console.log(' For now, drive services with the orchester CLI:')
    console.log('   npm -w @elio/orchester run dev')
    console.log('────────────────────────────────────────────')
    process.exit(0)
  }

  // Configured instance → boot the daemon (it reads instance.json to decide
  // which services to register, in a later round).
  console.log('elio: booting orchester daemon…')
  const daemon = spawn('npm', ['-w', '@elio/orchester', 'run', 'daemon'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  daemon.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error('elio failed to start:', err)
  process.exit(1)
})
