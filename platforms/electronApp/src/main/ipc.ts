// IPC surface — thin wrappers that map channel → fsService function. The
// preload bridge calls these via ipcRenderer.invoke; the renderer never sees
// fs or ipcRenderer directly. Keep this file boring: validation lives in
// fsService (path safety), routing lives here.

import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as fsService from './fsService.js'
import * as apiServer from './apiServer.js'
import * as scraperManager from './scraperManager.js'
import * as metadataService from './metadataService.js'
import * as terminalService from './terminalService.js'
import { tunnelClient, type ShareOpts } from './tunnelClient.js'
import { orchesterAdapter, initOrchester } from './orchesterAdapter.js'
import type { LinkParams } from '@muralink/orchester'
import { presenceService } from './presenceService.js'

export function registerIpc(): void {
  // Connect to the orchester daemon (spawns it if needed) and start forwarding
  // its status-change events to renderer windows. The daemon owns the services
  // (core, web-frontend, shares) — Electron no longer registers them itself.
  void initOrchester()

  ipcMain.handle('fs:homeDir', () => fsService.homeDir())
  ipcMain.handle('fs:listDir', (_e, p: string) => fsService.listDir(p))
  ipcMain.handle('fs:stat', (_e, p: string) => fsService.stat(p))
  ipcMain.handle('fs:readText', (_e, p: string, maxBytes?: number) =>
    fsService.readText(p, maxBytes),
  )
  ipcMain.handle('fs:writeText', (_e, p: string, content: string) =>
    fsService.writeText(p, content),
  )
  ipcMain.handle('fs:rename', (_e, p: string, newName: string) => fsService.rename(p, newName))
  ipcMain.handle('fs:move', (_e, src: string, destDir: string) => fsService.move(src, destDir))
  ipcMain.handle('fs:mkdir', (_e, parent: string, name: string) => fsService.mkdir(parent, name))
  ipcMain.handle('fs:copy', (_e, src: string, destDir: string) => fsService.copy(src, destDir))
  ipcMain.handle('fs:trash', (_e, p: string) => fsService.trash(p))

  // API server (direct, bypasses Orchester — kept for backward compat with ServiceBar)
  ipcMain.handle('service:status', () => apiServer.getStatus())
  ipcMain.handle('service:start', (_e, port?: number) => apiServer.startServer(port))
  ipcMain.handle('service:stop', () => apiServer.stopServer())

  // Scraper / Playwright
  ipcMain.handle('scraper:status', () => scraperManager.getScraperStatus())
  ipcMain.handle('scraper:install', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return scraperManager.installScraper((line) => {
      win?.webContents.send('scraper:progress', line)
    })
  })

  // Folder metadata
  ipcMain.handle('metadata:read', (_e, folderPath: string) => metadataService.readMetadata(folderPath))
  ipcMain.handle('metadata:write', (_e, folderPath: string, metadata: any) =>
    metadataService.writeMetadata(folderPath, metadata),
  )
  ipcMain.handle('metadata:updateTitle', (_e, folderPath: string, title: string) =>
    metadataService.updateFolderTitle(folderPath, title),
  )
  ipcMain.handle('metadata:updateGridItem', (_e, folderPath: string, itemPath: string, layout: any) =>
    metadataService.updateGridItem(folderPath, itemPath, layout),
  )
  ipcMain.handle('metadata:updateItemVisualization', (_e, folderPath: string, itemPath: string, type: string) =>
    metadataService.updateItemVisualization(folderPath, itemPath, type as 'icon' | 'preview'),
  )

  // Tunnel sharing
  ipcMain.handle('tunnel:login', (_e, email: string, password: string) =>
    tunnelClient.login(email, password),
  )
  ipcMain.handle('tunnel:isLoggedIn', () => tunnelClient.isLoggedIn())
  ipcMain.handle('tunnel:logout', () => tunnelClient.logout())
  ipcMain.handle('tunnel:createShare', (_e, opts: ShareOpts) =>
    tunnelClient.createShare(opts),
  )
  ipcMain.handle('tunnel:listShares', () => tunnelClient.listShares())
  ipcMain.handle('tunnel:revokeShare', (_e, id: string) => tunnelClient.revokeShare(id))
  ipcMain.handle('tunnel:getLanIp', () => tunnelClient.getLanIp())
  ipcMain.handle('tunnel:getPublicIp', () => tunnelClient.getPublicIp())

  // Terminal PTY
  ipcMain.handle('terminal:create', (e, cwd?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('No window')
    return terminalService.createTerminal(win, cwd)
  })
  ipcMain.handle('terminal:write', (_e, id: string, data: string) =>
    terminalService.writeTerminal(id, data),
  )
  ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) =>
    terminalService.resizeTerminal(id, cols, rows),
  )
  ipcMain.handle('terminal:kill', (_e, id: string) =>
    terminalService.killTerminal(id),
  )

  // Native dialog
  ipcMain.handle('dialog:pickDirectory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory'],
      title: 'Select directory to serve',
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Orchester — proxied to the shared daemon (CLI is the master).
  ipcMain.handle('orchester:status', () => orchesterAdapter.status())
  ipcMain.handle('orchester:start', (_e, id: string) => orchesterAdapter.start(id))
  ipcMain.handle('orchester:stop', (_e, id: string) => orchesterAdapter.stop(id))
  ipcMain.handle('orchester:restart', (_e, id: string) => orchesterAdapter.restart(id))
  ipcMain.handle(
    'orchester:configure',
    (_e, id: string, opts: { port?: number; path?: string; domain?: string }) =>
      orchesterAdapter.configure(id, opts),
  )

  // Folder shares CRUD — daemon owns persistence + the server pool.
  ipcMain.handle('orchester:addShare', (_e, opts: { label: string; path: string; port: number; domain?: string }) =>
    orchesterAdapter.addShare(opts),
  )
  ipcMain.handle('orchester:removeShare', (_e, id: string) => orchesterAdapter.removeShare(id))
  ipcMain.handle('orchester:updateShare', (_e, id: string, patch: { label?: string; port?: number; path?: string; domain?: string }) =>
    orchesterAdapter.updateShare(id, patch),
  )

  // Account link (anonymous-first) — persisted in ~/.elio/account.json by the daemon.
  ipcMain.handle('orchester:accountStatus', () => orchesterAdapter.accountStatus())
  ipcMain.handle('orchester:accountLogin', (_e, params: LinkParams) => orchesterAdapter.accountLogin(params))
  ipcMain.handle('orchester:accountLogout', () => orchesterAdapter.accountLogout())
  // status-change forwarding is wired in initOrchester().

  // Presence — which browser tabs are connected to the web frontend
  ipcMain.handle('presence:devices', () => presenceService.list())
  presenceService.on('change', (devices) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('presence:change', devices)
    }
  })
}
