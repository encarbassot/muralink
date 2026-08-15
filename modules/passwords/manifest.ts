import type { ModuleManifest } from '@muralink/types'

export const manifest: ModuleManifest = {
  id: 'passwords',
  version: '0.1.0',
  // Deliberately no module dependencies — the vault stores its own raw url
  // string and never reads or writes another module's data.
  dependencies: [],
  types: ['YVaultEntry'],
  views: [
    {
      id: 'passwords-vault',
      platforms: ['web'],
      sizes: ['2x2'],
      component: './implementations/web/views/PasswordVault.2x2',
    },
  ],
  // The vault can live on a server — sealed. The core stores one ciphertext
  // per entry and the PIN salt/verifier, and can read none of it; the key is
  // derived in the browser and never persisted. Declaring 'local-server' here
  // is what lets a self-hosted instance hold the vault at all.
  platforms: ['web', 'local-server'],
}

export default manifest
