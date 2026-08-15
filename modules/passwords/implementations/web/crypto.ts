// PIN-derived encryption for the vault. Nothing here ever persists the PIN or
// the derived key — both live only in memory for the duration of an unlocked
// session (see vaultStore.ts). Web Crypto (PBKDF2 + AES-GCM) is available in
// every browser and extension context this module ships for.

import type { YEncryptedBlob } from '../../types.ts'

const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const IV_BYTES = 12
// Known plaintext encrypted with the derived key so a wrong PIN can be
// rejected before touching real entries. AES-GCM's auth tag makes decryption
// fail loudly on any key mismatch — this is not a stored hash of the PIN.
const VERIFIER_PLAINTEXT = 'muralink-passwords-vault'

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function generateSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

export async function deriveVaultKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64) as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<YEncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { ciphertext: toB64(ciphertext), iv: toB64(iv) }
}

export async function decryptText(key: CryptoKey, blob: YEncryptedBlob): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv) as BufferSource },
    key,
    fromB64(blob.ciphertext) as BufferSource,
  )
  return new TextDecoder().decode(plaintext)
}

export function makeVerifier(key: CryptoKey): Promise<YEncryptedBlob> {
  return encryptText(key, VERIFIER_PLAINTEXT)
}

export async function checkVerifier(key: CryptoKey, verifier: YEncryptedBlob): Promise<boolean> {
  try {
    return (await decryptText(key, verifier)) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}
