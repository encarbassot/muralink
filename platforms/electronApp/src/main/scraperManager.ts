// Manages the Playwright Chromium browser used by the Interceptor.
// Stores the browser in app.getPath('userData')/playwright so it survives
// app updates and isn't confused with system browsers.
//
// Install is async and streams stdout/stderr back via the progress callback so
// the renderer can show a live log. Chromium download is ~150 MB.

import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type ScraperStatus = 'not-installed' | 'installing' | 'ready' | 'error'

let _status: ScraperStatus = 'not-installed'
let _error: string | null = null

function playwrightDir(): string {
  return join(app.getPath('userData'), 'playwright')
}

function chromiumMarker(): string {
  // playwright-core writes a .local-chromium dir when chromium is installed
  return join(playwrightDir(), '.local-chromium')
}

export function getScraperStatus(): { status: ScraperStatus; error: string | null } {
  if (_status === 'not-installed' || _status === 'error') {
    // check if a previous install succeeded (survives restarts)
    if (existsSync(chromiumMarker())) _status = 'ready'
  }
  return { status: _status, error: _error }
}

export function installScraper(
  onProgress: (line: string) => void,
): Promise<void> {
  if (_status === 'installing') return Promise.reject(new Error('already installing'))
  _status = 'installing'
  _error = null

  return new Promise((resolve, reject) => {
    // playwright-core ships a CLI at `node_modules/.bin/playwright`
    const playwrightBin = join(
      app.getAppPath(),
      '..', '..', 'node_modules', '.bin', 'playwright',
    )

    const proc = execFile(
      process.execPath, // node binary bundled with Electron
      [playwrightBin, 'install', 'chromium'],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: playwrightDir(),
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    proc.stdout?.on('data', (d: Buffer) => onProgress(d.toString()))
    proc.stderr?.on('data', (d: Buffer) => onProgress(d.toString()))

    proc.on('close', (code) => {
      if (code === 0) {
        _status = 'ready'
        resolve()
      } else {
        _status = 'error'
        _error = `playwright install exited with code ${code}`
        reject(new Error(_error))
      }
    })

    proc.on('error', (err) => {
      _status = 'error'
      _error = err.message
      reject(err)
    })
  })
}

export function getBrowserPath(): string | null {
  if (_status !== 'ready') return null
  const dir = playwrightDir()
  if (!existsSync(dir)) return null
  try {
    const subdirs = readdirSync(dir).filter((n) => n.startsWith('chromium'))
    if (!subdirs.length) return null
    const sub = subdirs[0]!
    return join(dir, sub, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
  } catch {
    return null
  }
}
