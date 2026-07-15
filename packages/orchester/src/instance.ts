// Instance state — the contract the first-run wizard will write and the daemon
// reads to decide which services to enable. PATH-PREP only: this defines the
// schema + load/save; the interactive wizard is built in a later round.
//
// Stored at ~/.elio/instance.json. Absence = first run (wizard not done yet).

import { readFileSync, writeFileSync } from 'node:fs'
import { paths, ensureHome } from './paths'

export interface InstanceState {
  version: 1
  // Which surfaces/services the user chose to install/enable.
  installed: {
    electron: boolean
    web: boolean
    nas: boolean
    https: boolean
  }
  // Module ids the instance runs.
  modules: string[]
  nas?: { rootPath: string }
  https?: { domain: string }
}

export const defaultInstance: InstanceState = {
  version: 1,
  installed: { electron: false, web: true, nas: false, https: false },
  modules: [],
}

export function loadInstance(): InstanceState | null {
  try {
    return JSON.parse(readFileSync(paths.instance, 'utf-8')) as InstanceState
  } catch {
    return null
  }
}

export function saveInstance(state: InstanceState): void {
  ensureHome()
  writeFileSync(paths.instance, JSON.stringify(state, null, 2))
}

export function isFirstRun(): boolean {
  return loadInstance() === null
}
