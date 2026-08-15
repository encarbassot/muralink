// Types this module exposes. A vault entry never stores the password in the
// clear — only its AES-GCM ciphertext, decryptable exclusively with the key
// derived from the vault's 6-digit PIN. Lose the PIN, lose the password: by
// design there is no recovery path.

export interface YEncryptedBlob {
  ciphertext: string // base64
  iv: string // base64, unique per encryption call
}

// Legacy on-device shape: url and username in the clear, only the password
// encrypted. Still read (and migrated on unlock) so no existing vault breaks,
// but never written any more — see YVaultRecord.
export interface YVaultEntry {
  id: string
  url: string
  username: string
  encrypted: YEncryptedBlob
  updatedAt?: string
  // Runtime-only, stamped by @muralink/spaces — never persisted in the payload.
  spaceId?: string
}

// What a vault entry actually looks like at rest, on any space.
//
// The whole secret — url, username and password together — is one AES-GCM
// ciphertext. Nothing else is stored, deliberately: an entry that keeps its url
// in the clear tells whoever holds the storage which services you have accounts
// with, which is most of what an attacker wanted anyway. This shape is what
// lets the vault live on a server without the server learning anything: it
// holds opaque bytes and a timestamp, and the key never leaves the browser.
export interface YVaultRecord {
  id: string
  blob: YEncryptedBlob
  updatedAt?: string
  // Runtime-only, stamped by @muralink/spaces — never persisted in the payload.
  spaceId?: string
}

// The plaintext inside YVaultRecord.blob. Exists only in memory, only while
// the vault is unlocked.
export interface YVaultSecret {
  url: string
  username: string
  password: string
}

// PIN-derivation parameters plus the verifier. Held per storage location so a
// second device can unlock the same vault with the same PIN and nothing more.
// The salt is not a secret; the verifier is a ciphertext, not a hash of the PIN.
export interface YVaultMeta {
  salt: string
  verifier: YEncryptedBlob
  updatedAt?: string
}
