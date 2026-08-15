#!/usr/bin/env node
// Headless deploy driver. Same TS-through-tsx launch as orchesterd so a fresh
// clone runs with no build step.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '../src/deploy/cli.ts')
const child = spawn('npx', ['tsx', entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
