import type { ModuleManifest } from '@muralink/types'

// expenses — a two-party running-balance ledger. Each "account" is the ledger
// between the local user ("Yo") and one contact, so the module depends on
// contacts (the account id IS the contact id). Single-user core: sharing the
// same ledger with the other party is a later tunnel/space concern, not here.
export const manifest: ModuleManifest = {
  id: 'expenses',
  version: '0.1.0',
  dependencies: ['contacts'],
  types: ['YExpenseEntry'],
  views: [
    {
      id: 'expenses-ledger',
      platforms: ['web'],
      sizes: ['2x2', '2x3', '3x2', '3x3'],
      component: './implementations/web/views/LedgerCard',
    },
    {
      id: 'expenses-overview',
      platforms: ['web'],
      sizes: ['2x2', '2x3', '3x2'],
      component: './implementations/web/views/OverviewCard',
    },
  ],
  platforms: ['web', 'local-server'],
}

export default manifest
