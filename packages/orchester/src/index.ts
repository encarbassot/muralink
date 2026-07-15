// Public surface of @muralink/orchester.

export { Orchester } from './orchester'
export type {
  ManagedService,
  ServiceStatus,
  ServiceDriver,
  ServiceConfig,
  EmbeddedConfig,
  ProcessConfig,
} from './orchester'
export { OrchesterClient, ensureDaemon } from './client'
export type { StatusListener, LogListener } from './client'
export type { LogLine } from './protocol'
export { FrontendServer, FrontendServerPool } from './frontend-server'
export type { FrontendServerOptions } from './frontend-server'
export { HttpsGateway } from './https-gateway'
export type { HttpsGatewayOptions } from './https-gateway'
export { ensureSelfSigned } from './tls'
export { ShareManager } from './shares'
export type { ShareDef } from './shares'
export { startDaemon } from './daemon'
export { buildDefaultServices } from './services/index'
export { paths, ensureHome } from './paths'
export { loadInstance, saveInstance, isFirstRun, defaultInstance } from './instance'
export type { InstanceState } from './instance'
export {
  loadAccount,
  saveAccount,
  clearAccount,
  linkAccount,
  unlinkAccount,
  AccountAgent,
} from './account'
export type { AccountLink, AccountStatus, LinkParams } from './account'
