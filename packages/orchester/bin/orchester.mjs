#!/usr/bin/env node
// Launch the orchester CLI (Ink TUI). Runs the TSX entry through tsx so no
// build step is needed for development / clone-and-run.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '../src/cli/index.tsx')
const child = spawn('npx', ['tsx', entry], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
