export { initMailSchema } from './schema.ts'
export { createMailRouter } from './routes.ts'
export { startMailWorker, enqueueJob, type MailWorker } from './jobs.ts'
export { createMailSetupRouter } from './setupRoutes.ts'
export {
  initMailSetupSchema,
  getSetup,
  saveSetup,
  setEnabled,
  effectiveMailConfig,
  dnsRecords,
  portRequirements,
  verifyDns,
  verifyPorts,
  envSnippet,
  mailHostFor,
} from './setup.ts'
export type { MailFileAccess } from './fileAccess.ts'
export * from './queries.ts'
