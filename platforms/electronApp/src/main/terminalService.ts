import { BrowserWindow } from 'electron'
import { homedir } from 'node:os'

let ptyModule: typeof import('node-pty') | null = null
function getPty() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!ptyModule) ptyModule = require(['node', 'pty'].join('-'))
  return ptyModule
}

interface ManagedTerminal {
  proc: import('node-pty').IPty
  winId: number
}

const terminals = new Map<string, ManagedTerminal>()
let nextId = 0

export function createTerminal(win: BrowserWindow, cwd?: string): string {
  const pty = getPty()
  const id = `term-${++nextId}`
  const shell = process.env.SHELL || '/bin/zsh'

  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || homedir(),
    env: process.env as Record<string, string>,
  })

  proc.onData((data) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data)
    }
  })

  proc.onExit(({ exitCode }) => {
    terminals.delete(id)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id, exitCode)
    }
  })

  terminals.set(id, { proc, winId: win.id })
  return id
}

export function writeTerminal(id: string, data: string): void {
  terminals.get(id)?.proc.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  terminals.get(id)?.proc.resize(cols, rows)
}

export function killTerminal(id: string): void {
  const t = terminals.get(id)
  if (t) {
    t.proc.kill()
    terminals.delete(id)
  }
}

export function killAllTerminals(): void {
  for (const [id, t] of terminals) {
    t.proc.kill()
    terminals.delete(id)
  }
}
