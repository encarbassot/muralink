// Copy text to the system clipboard. macOS: pbcopy; Linux: xclip/xsel;
// Windows: clip. Resolves false if no clipboard tool is available.

import { spawn } from 'node:child_process'

function candidates(): Array<{ cmd: string; args: string[] }> {
  if (process.platform === 'darwin') return [{ cmd: 'pbcopy', args: [] }]
  if (process.platform === 'win32') return [{ cmd: 'clip', args: [] }]
  return [
    { cmd: 'xclip', args: ['-selection', 'clipboard'] },
    { cmd: 'xsel', args: ['--clipboard', '--input'] },
  ]
}

export function copyToClipboard(text: string): Promise<boolean> {
  const tools = candidates()

  return new Promise((resolve) => {
    const tryNext = (i: number): void => {
      const tool = tools[i]
      if (!tool) { resolve(false); return }
      const proc = spawn(tool.cmd, tool.args)
      proc.on('error', () => tryNext(i + 1))
      proc.on('close', (code) => resolve(code === 0))
      proc.stdin.end(text)
    }
    tryNext(0)
  })
}
