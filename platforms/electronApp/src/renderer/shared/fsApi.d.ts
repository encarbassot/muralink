// Ambient typing for the preload bridge. Mirrors src/preload/index.ts (FsApi)
// and the data shapes in src/main/fsService.ts. Kept renderer-local so the UI
// never imports from the main process. If you change the bridge, change here.

import type { MetadataApi } from '../../preload/index.js'
import type { FolderMetadata } from './folderMetadata.js'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtimeMs: number
  ext: string
}

export interface StatInfo {
  path: string
  name: string
  isDir: boolean
  size: number
  mtimeMs: number
  ctimeMs: number
  ext: string
}

export interface TextResult {
  text: string
  truncated: boolean
  isText: boolean
}

export interface FsApi {
  homeDir(): Promise<string>
  listDir(path: string): Promise<DirEntry[]>
  stat(path: string): Promise<StatInfo>
  readText(path: string, maxBytes?: number): Promise<TextResult>
  writeText(path: string, content: string): Promise<void>
  rename(path: string, newName: string): Promise<string>
  move(src: string, destDir: string): Promise<string>
  mkdir(parent: string, name: string): Promise<string>
  copy(src: string, destDir: string): Promise<string>
  trash(path: string): Promise<void>
}

export interface ServerStatus {
  running: boolean
  port: number | null
  lanUrl: string | null
}

export type ScraperStatus = 'not-installed' | 'installing' | 'ready' | 'error'

export interface ServiceApi {
  status(): Promise<ServerStatus>
  start(port?: number): Promise<ServerStatus>
  stop(): Promise<void>
}

export interface ScraperApi {
  status(): Promise<{ status: ScraperStatus; error: string | null }>
  install(): Promise<void>
  onProgress(cb: (line: string) => void): () => void
}

export interface MetadataApiInterface {
  read(folderPath: string): Promise<FolderMetadata | null>
  write(folderPath: string, metadata: FolderMetadata): Promise<void>
  updateTitle(folderPath: string, title: string): Promise<void>
  updateGridItem(folderPath: string, itemPath: string, layout: any): Promise<void>
  updateItemVisualization(folderPath: string, itemPath: string, type: 'icon' | 'preview'): Promise<void>
}

export interface TerminalApi {
  create(cwd?: string): Promise<string>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): () => void
  onExit(cb: (id: string, exitCode: number) => void): () => void
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

export interface TunnelApi {
  login(email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }>
  isLoggedIn(): Promise<boolean>
  logout(): Promise<void>
  createShare(opts: ShareOpts): Promise<ShareResult>
  listShares(): Promise<ShareInfo[]>
  revokeShare(id: string): Promise<void>
  getLanIp(): Promise<string | null>
  getPublicIp(): Promise<string>
}

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'error'
export type ServiceDriver = 'embedded' | 'process' | 'docker' | 'pm2' | 'web-frontend' | 'share'

export interface ManagedService {
  id: string
  label: string
  description?: string
  port?: number
  domain?: string
  path?: string
  status: ServiceStatus
  pid?: number
  error?: string
  driver: ServiceDriver
  configurable?: boolean
}

export interface OrchesterApi {
  getStatus(): Promise<ManagedService[]>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  restart(id: string): Promise<void>
  configure(id: string, opts: { port?: number; path?: string; domain?: string }): Promise<void>
  addShare(opts: { label: string; path: string; port: number; domain?: string }): Promise<void>
  removeShare(id: string): Promise<void>
  updateShare(id: string, patch: { label?: string; port?: number; path?: string; domain?: string }): Promise<void>
  onStatusChange(cb: (services: ManagedService[]) => void): () => void
}

export interface DialogApi {
  pickDirectory(): Promise<string | null>
}

export interface ShellApi {
  openExternal(url: string): Promise<void>
}

export interface ConnectedDevice {
  id: string
  agent: string
  platform: string
  ip: string
  connectedAt: string
  lastSeen: string
}

export interface PresenceApi {
  getDevices(): Promise<ConnectedDevice[]>
  onDevicesChange(cb: (devices: ConnectedDevice[]) => void): () => void
}

declare global {
  interface Window {
    fsApi: FsApi
    serviceApi: ServiceApi
    scraperApi: ScraperApi
    metadataApi: MetadataApiInterface
    terminalApi: TerminalApi
    tunnelApi: TunnelApi
    dialogApi: DialogApi
    shellApi: ShellApi
    orchesterApi: OrchesterApi
    presenceApi: PresenceApi
  }
}
