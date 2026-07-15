// Preload — the single, typed bridge between renderer and main.
// Exposes `window.fsApi`, `window.serviceApi`, and `window.scraperApi`.
// No fs, no ipcRenderer leak. Types mirrored in renderer/shared/.

import { contextBridge, ipcRenderer, shell } from 'electron'
import type { DirEntry, StatInfo, TextResult } from '../main/fsService.js'
import type { ServerStatus } from '../main/apiServer.js'
import type { ScraperStatus } from '../main/scraperManager.js'
import type { FolderMetadata, GridItemLayout, ItemVisualization } from '../renderer/shared/folderMetadata.js'
import type { ManagedService, AccountStatus, LinkParams } from '@muralink/orchester'
import type { ConnectedDevice } from '../main/presenceService.js'

const fsApi = {
  homeDir: (): Promise<string> => ipcRenderer.invoke('fs:homeDir'),
  listDir: (path: string): Promise<DirEntry[]> => ipcRenderer.invoke('fs:listDir', path),
  stat: (path: string): Promise<StatInfo> => ipcRenderer.invoke('fs:stat', path),
  readText: (path: string, maxBytes?: number): Promise<TextResult> =>
    ipcRenderer.invoke('fs:readText', path, maxBytes),
  writeText: (path: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeText', path, content),
  rename: (path: string, newName: string): Promise<string> =>
    ipcRenderer.invoke('fs:rename', path, newName),
  move: (src: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke('fs:move', src, destDir),
  mkdir: (parent: string, name: string): Promise<string> =>
    ipcRenderer.invoke('fs:mkdir', parent, name),
  copy: (src: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke('fs:copy', src, destDir),
  trash: (path: string): Promise<void> => ipcRenderer.invoke('fs:trash', path),
}

const serviceApi = {
  status: (): Promise<ServerStatus> => ipcRenderer.invoke('service:status'),
  start: (port?: number): Promise<ServerStatus> => ipcRenderer.invoke('service:start', port),
  stop: (): Promise<void> => ipcRenderer.invoke('service:stop'),
}

const scraperApi = {
  status: (): Promise<{ status: ScraperStatus; error: string | null }> =>
    ipcRenderer.invoke('scraper:status'),
  install: (): Promise<void> => ipcRenderer.invoke('scraper:install'),
  onProgress: (cb: (line: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, line: string) => cb(line)
    ipcRenderer.on('scraper:progress', handler)
    return () => ipcRenderer.off('scraper:progress', handler)
  },
}

const metadataApi = {
  read: (folderPath: string): Promise<FolderMetadata | null> =>
    ipcRenderer.invoke('metadata:read', folderPath),
  write: (folderPath: string, metadata: FolderMetadata): Promise<void> =>
    ipcRenderer.invoke('metadata:write', folderPath, metadata),
  updateTitle: (folderPath: string, title: string): Promise<void> =>
    ipcRenderer.invoke('metadata:updateTitle', folderPath, title),
  updateGridItem: (folderPath: string, itemPath: string, layout: GridItemLayout): Promise<void> =>
    ipcRenderer.invoke('metadata:updateGridItem', folderPath, itemPath, layout),
  updateItemVisualization: (folderPath: string, itemPath: string, type: 'icon' | 'preview'): Promise<void> =>
    ipcRenderer.invoke('metadata:updateItemVisualization', folderPath, itemPath, type),
}

const terminalApi = {
  create: (cwd?: string): Promise<string> => ipcRenderer.invoke('terminal:create', cwd),
  write: (id: string, data: string): void => { void ipcRenderer.invoke('terminal:write', id, data) },
  resize: (id: string, cols: number, rows: number): void => { void ipcRenderer.invoke('terminal:resize', id, cols, rows) },
  kill: (id: string): void => { void ipcRenderer.invoke('terminal:kill', id) },
  onData: (cb: (id: string, data: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.off('terminal:data', handler)
  },
  onExit: (cb: (id: string, exitCode: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.off('terminal:exit', handler)
  },
}

export interface ShareOpts {
  hostIp: string
  hostPort: number
  rootPath: string
  password: string
  expiresAt?: string | null
}

export interface ShareResult {
  id: string
  token: string
  url: string
  expiresAt: string | null
}

export interface ShareInfo {
  id: string
  rootPath: string
  hostIp: string
  hostPort: number
  expiresAt: string | null
  createdAt: string
}

const tunnelApi = {
  login: (email: string, password: string) =>
    ipcRenderer.invoke('tunnel:login', email, password) as Promise<{ token: string; user: { id: string; email: string } }>,
  isLoggedIn: () => ipcRenderer.invoke('tunnel:isLoggedIn') as Promise<boolean>,
  logout: () => ipcRenderer.invoke('tunnel:logout') as Promise<void>,
  createShare: (opts: ShareOpts) =>
    ipcRenderer.invoke('tunnel:createShare', opts) as Promise<ShareResult>,
  listShares: () => ipcRenderer.invoke('tunnel:listShares') as Promise<ShareInfo[]>,
  revokeShare: (id: string) => ipcRenderer.invoke('tunnel:revokeShare', id) as Promise<void>,
  getLanIp: () => ipcRenderer.invoke('tunnel:getLanIp') as Promise<string | null>,
  getPublicIp: () => ipcRenderer.invoke('tunnel:getPublicIp') as Promise<string>,
}

const dialogApi = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDirectory'),
}

const shellApi = {
  openExternal: (url: string): Promise<void> => shell.openExternal(url),
}

const orchesterApi = {
  getStatus: (): Promise<ManagedService[]> => ipcRenderer.invoke('orchester:status'),
  start: (id: string): Promise<void> => ipcRenderer.invoke('orchester:start', id),
  stop: (id: string): Promise<void> => ipcRenderer.invoke('orchester:stop', id),
  restart: (id: string): Promise<void> => ipcRenderer.invoke('orchester:restart', id),
  configure: (
    id: string,
    opts: { port?: number; path?: string; domain?: string },
  ): Promise<void> => ipcRenderer.invoke('orchester:configure', id, opts),
  addShare: (opts: { label: string; path: string; port: number; domain?: string }): Promise<void> =>
    ipcRenderer.invoke('orchester:addShare', opts),
  removeShare: (id: string): Promise<void> => ipcRenderer.invoke('orchester:removeShare', id),
  updateShare: (id: string, patch: { label?: string; port?: number; path?: string; domain?: string }): Promise<void> =>
    ipcRenderer.invoke('orchester:updateShare', id, patch),
  onStatusChange: (cb: (services: ManagedService[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, services: ManagedService[]) => cb(services)
    ipcRenderer.on('orchester:status-change', handler)
    return () => ipcRenderer.off('orchester:status-change', handler)
  },
  // Account link (anonymous-first): status / login / logout against the Tunnel.
  accountStatus: (): Promise<AccountStatus> => ipcRenderer.invoke('orchester:accountStatus'),
  accountLogin: (params: LinkParams): Promise<AccountStatus> =>
    ipcRenderer.invoke('orchester:accountLogin', params),
  accountLogout: (): Promise<AccountStatus> => ipcRenderer.invoke('orchester:accountLogout'),
}

const presenceApi = {
  getDevices: (): Promise<ConnectedDevice[]> => ipcRenderer.invoke('presence:devices'),
  onDevicesChange: (cb: (devices: ConnectedDevice[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, devices: ConnectedDevice[]) => cb(devices)
    ipcRenderer.on('presence:change', handler)
    return () => ipcRenderer.off('presence:change', handler)
  },
}

export type PresenceApi = typeof presenceApi
export type { ConnectedDevice }

export type FsApi = typeof fsApi
export type ServiceApi = typeof serviceApi
export type ScraperApi = typeof scraperApi
export type MetadataApi = typeof metadataApi
export type TerminalApi = typeof terminalApi
export type TunnelApi = typeof tunnelApi
export type DialogApi = typeof dialogApi
export type ShellApi = typeof shellApi
export type OrchesterApi = typeof orchesterApi
export type { ManagedService }

contextBridge.exposeInMainWorld('fsApi', fsApi)
contextBridge.exposeInMainWorld('serviceApi', serviceApi)
contextBridge.exposeInMainWorld('scraperApi', scraperApi)
contextBridge.exposeInMainWorld('metadataApi', metadataApi)
contextBridge.exposeInMainWorld('terminalApi', terminalApi)
contextBridge.exposeInMainWorld('tunnelApi', tunnelApi)
contextBridge.exposeInMainWorld('dialogApi', dialogApi)
contextBridge.exposeInMainWorld('shellApi', shellApi)
contextBridge.exposeInMainWorld('orchesterApi', orchesterApi)
contextBridge.exposeInMainWorld('presenceApi', presenceApi)
