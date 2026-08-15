// The vault's server tables. Note what is NOT here: no url column, no username
// column, no searchable anything. The server stores a ciphertext, an IV and a
// timestamp per entry, and it cannot read any of them — the key is derived from
// a PIN that only ever exists in the user's browser.
//
// That constraint is the feature. It also means the server can offer no search,
// no autofill matching and no "which of these is my bank" — those all happen
// client-side after decryption, and any route that seemed to need plaintext
// here would be a bug in the design, not a missing feature.

export const schema = `
CREATE TABLE IF NOT EXISTS vault_entries (
  id          TEXT PRIMARY KEY,
  ciphertext  TEXT NOT NULL,
  iv          TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_entries_updated ON vault_entries (updated_at);

-- Single row (id = 1): the PIN salt and the verifier ciphertext. Publishing
-- these to a second device is what lets the same PIN unlock the same vault
-- there; neither reveals the PIN.
CREATE TABLE IF NOT EXISTS vault_meta (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  salt                 TEXT NOT NULL,
  verifier_ciphertext  TEXT NOT NULL,
  verifier_iv          TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
`
