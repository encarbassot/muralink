// Headless deploy driver — the same checklist as the TUI wizard, over SSH.
//
//   orchester-deploy status                    # run every check, print, exit
//   orchester-deploy set domain=x.mural.ink …  # edit the answer sheet
//   orchester-deploy apply <step-id>           # apply one step
//   orchester-deploy apply --all               # apply everything pending
//
// Exit codes: 0 = everything green, 1 = something failed, 2 = usage error.
// A non-zero exit on `status` is what lets a provisioning script gate on it.
//
// The basic-auth password never goes in the config file, so it comes in via
// MURALINK_AUTH_PASSWORD for the one step that needs it.

import {
  DEPLOY_STEPS, type DeployStep, type StepContext, type StepReport,
} from './steps'
import {
  defaultConfig, loadDeployConfig, newApiToken, publicUrl, saveDeployConfig,
  type DeployConfig,
} from './config'

const MARK: Record<StepReport['state'], string> = { ok: 'ok  ', todo: 'todo', warn: 'warn', fail: 'FAIL' }

function makeContext(cfg: DeployConfig): StepContext {
  return {
    cfg,
    log: (line) => console.log(`    │ ${line}`),
    secrets: { basicAuthPassword: process.env['MURALINK_AUTH_PASSWORD'] || undefined },
  }
}

function print(step: DeployStep, report: StepReport): void {
  console.log(`[${MARK[report.state]}] ${step.title} — ${report.detail}`)
  for (const hint of report.hints ?? []) console.log(`         ${hint}`)
}

async function check(step: DeployStep, ctx: StepContext): Promise<StepReport> {
  try {
    return await step.check(ctx)
  } catch (err) {
    return { state: 'fail', detail: String(err) }
  }
}

async function cmdStatus(cfg: DeployConfig): Promise<number> {
  const ctx = makeContext(cfg)
  console.log(`instance: ${publicUrl(cfg)}  (repo ${cfg.repoRoot})\n`)
  let worst = 0
  for (const step of DEPLOY_STEPS) {
    const report = await check(step, ctx)
    print(step, report)
    if (report.state === 'fail') worst = 1
    else if (report.state === 'todo' && worst === 0) worst = 1
  }
  return worst
}

async function apply(step: DeployStep, ctx: StepContext): Promise<StepReport> {
  if (!step.apply) return check(step, ctx)
  console.log(`→ ${step.title}`)
  let report: StepReport
  try {
    report = await step.apply(ctx)
  } catch (err) {
    report = { state: 'fail', detail: String(err) }
  }
  // Same rule as the TUI: the check is the authority on whether it worked.
  return report.state === 'fail' ? report : check(step, ctx)
}

async function cmdApply(cfg: DeployConfig, target: string): Promise<number> {
  const ctx = makeContext(cfg)

  if (target === '--all') {
    for (const step of DEPLOY_STEPS) {
      const current = await check(step, ctx)
      if (current.state === 'ok') { print(step, current); continue }
      if (step.manual) {
        print(step, current)
        console.error(`\n"${step.title}" needs values — set them with \`orchester-deploy set …\` and re-run.`)
        return 1
      }
      const report = await apply(step, ctx)
      print(step, report)
      if (report.state === 'fail') return 1
    }
    console.log(`\ndone — ${publicUrl(cfg)}`)
    return 0
  }

  const step = DEPLOY_STEPS.find((s) => s.id === target)
  if (!step) {
    console.error(`unknown step "${target}". known: ${DEPLOY_STEPS.map((s) => s.id).join(', ')}`)
    return 2
  }
  const report = await apply(step, ctx)
  print(step, report)
  return report.state === 'fail' ? 1 : 0
}

// `set key=value` over the flat parts of the config. aliases takes a
// comma-separated list; apiToken accepts the literal `generate`.
function cmdSet(cfg: DeployConfig, pairs: string[]): number {
  if (!pairs.length) { console.error('nothing to set'); return 2 }
  const next = { ...cfg }
  const shape = defaultConfig() as unknown as Record<string, unknown>

  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 0) { console.error(`bad pair "${pair}" — expected key=value`); return 2 }
    const key = pair.slice(0, eq)
    const value = pair.slice(eq + 1)
    if (!(key in shape)) {
      console.error(`unknown key "${key}". known: ${Object.keys(shape).join(', ')}`)
      return 2
    }
    const target = next as unknown as Record<string, unknown>
    if (key === 'aliases') target[key] = value.split(',').map((s) => s.trim()).filter(Boolean)
    else if (key === 'apiToken' && (value === 'generate' || value === '')) target[key] = newApiToken()
    else if (typeof shape[key] === 'number') target[key] = Number(value)
    else target[key] = value
  }

  saveDeployConfig(next)
  console.log('saved:')
  for (const [k, v] of Object.entries(next)) {
    console.log(`  ${k.padEnd(14)} ${k === 'apiToken' ? `${String(v).slice(0, 8)}… (${String(v).length} chars)` : JSON.stringify(v)}`)
  }
  return 0
}

function usage(): number {
  console.log(`orchester-deploy — put a Muralink instance on this machine

  status                 run every check and report
  set <key=value>…       edit the deploy answer sheet
  apply <step-id>        apply one step
  apply --all            apply every pending step, stopping at the first failure

steps: ${DEPLOY_STEPS.map((s) => s.id).join(', ')}

env:
  MURALINK_AUTH_PASSWORD   basic-auth password for the nginx gate (never stored)`)
  return 2
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const cfg = loadDeployConfig()

  let code: number
  switch (command) {
    case 'status':
    case undefined:
      code = await cmdStatus(cfg)
      break
    case 'set':
      code = cmdSet(cfg, rest)
      break
    case 'apply':
      code = await cmdApply(cfg, rest[0] ?? '--all')
      break
    default:
      code = usage()
  }
  process.exit(code)
}

void main()
