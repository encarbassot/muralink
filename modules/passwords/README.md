# passwords

Credential vault gated by a 6-digit PIN. No module dependencies. Deviates from
the old scaffold note (which proposed reusing `YPassword { hash }`): this vault
needs to *retrieve* the password, not just verify it, so it defines its own
types (`modules/passwords/types.ts`) instead.

## Model

- One entry = `{ url, username, password }`.
- The vault is gated by a **6-digit PIN**, never stored.
  `implementations/web/crypto.ts` derives an AES-GCM key from it via PBKDF2
  (210k iterations, random per-vault salt). A "verifier" blob (a known
  plaintext encrypted with the derived key) lets unlock reject a wrong PIN
  without persisting the PIN.
- **Lose the PIN, lose the data.** No recovery path, by design.

## Where the vault lives

The rule is *not* "the vault must stay on this device" — it is **"nobody but
you may read the vault"**. So the vault travels between spaces like any other
collection, and it travels sealed:

- **The whole secret is one ciphertext.** `YVaultRecord.blob` is the AES-GCM
  encryption of `{ url, username, password }` together. A storage location
  learns an id, a timestamp and opaque bytes — not even which sites you have
  accounts with. (An entry that kept its url in the clear would give away most
  of what an attacker wanted.)
- **The key never leaves the browser.** Derived from the PIN on unlock, held in
  memory, dropped on lock. It is never sent, never persisted, on any space.
- **Salt + verifier are published, not secret.** A second device fetches them
  and unlocks with the same PIN and nothing else. Neither reveals the PIN, and
  neither helps decrypt an entry.

Spaces:

| Space | Registered by | Holds |
|---|---|---|
| `local` | this module | sealed records in IndexedDB (`muralink-passwords`) |
| `orchester` | the host (`platforms/web/src/serverVault.ts`) | sealed records in the instance's sqlite |

No space registered by the host = device-only, exactly as before.

### Migration from the pre-sealed format

Older entries stored `url` and `username` in the clear next to an encrypted
password. `unlock()` reads them, decrypts, and rewrites them sealed on the
local space — a full replace, so the plaintext columns actually go away. An
entry that cannot be decrypted (written under a different PIN, or corrupt) is
skipped with a warning rather than blocking the whole vault from opening.

## Server surface

`implementations/server/` — mounted at `/api/passwords`, REST at the mount root
so the client's http space points straight at it.

```
GET    /meta        salt + verifier          (404 when no vault exists)
PUT    /meta        create/replace           (409 if entries exist under another PIN)
GET    /            list sealed records
POST   /            create (server mints the id)
PATCH  /:id         replace the ciphertext
DELETE /:id
```

The schema has no url column, no username column, nothing searchable. That is a
constraint, not an omission: **any route here that appeared to need plaintext
would be a bug in the design.** Search, autofill matching and sorting all happen
client-side after decryption.

`PUT /meta` refusing to re-key a non-empty vault is the same principle applied
to a footgun: replacing the salt changes which key opens the vault, and every
stored ciphertext was written under the old one.

## Structure

- `types.ts` — `YVaultRecord` (sealed, current), `YVaultSecret`, `YVaultMeta`,
  `YEncryptedBlob`, `YVaultEntry` (legacy, read-only).
- `manifest.ts` — `platforms: ['web', 'local-server']`.
- `implementations/web/crypto.ts` — PIN → key, encrypt/decrypt, verifier.
- `implementations/web/vaultStore.ts` — zustand store: setup/unlock/lock + CRUD
  over spaces, plus the `VaultMetaRemote` seam the host fills in.
- `implementations/web/views/PasswordVault.2x2.tsx` — PIN gate + list UI.
- `implementations/server/` — schema, queries, routes.

## Not yet built

- Extension implementation.
- Fields beyond url/username/password (notes, TOTP, custom fields).
- PIN rotation (would be: re-seal every entry under the new key, then
  `PUT /meta` with `force: true` — the routes already allow that shape).
- Conflict resolution when the same entry is edited on two devices offline;
  today last write wins.
