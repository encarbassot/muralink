// Main process entry. Owns the app lifecycle and a single hardened
// BrowserWindow. The renderer is locked down: contextIsolation on,
// nodeIntegration off. All privileged work happens here via the IPC surface.

import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc.js'
import { startServer, stopServer } from './apiServer.js'
import { killAllTerminals } from './terminalService.js'

// import.meta.dirname is available on Electron 33 (Node 20.11+).
const dirname = import.meta.dirname

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: 'Mural Files',
    backgroundColor: '#0b0d10',
    titleBarStyle: 'hiddenInset', // native macOS traffic lights, our own chrome
    webPreferences: {
      preload: join(dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false lets the preload load as ESM; contextIsolation is the
      // real guard. Renderer still has no Node/ipc access beyond window.fsApi.
      sandbox: false,
    },
  })

  // electron-vite injects the dev server URL; falls back to the built file.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  void startServer()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  killAllTerminals()
  void stopServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
