import type { Database } from 'better-sqlite3'

// Persistence for the payment seam (@muralink/payments). The package itself is
// stateless (Mock aside); the SERVER owns the row and is the source of truth for
// amounts — this is what fixes the old getStatus amount:0 shortcut.
//
// One table for both rails: `kind` = 'charge' (immediate Checkout Session) or
// 'deposit' (a PaymentIntent HOLD you later capture/void). `provider_ref` holds
// the Stripe id (cs_… / pi_…) the webhook keys off. Correlation is by `reference`
// (opaque caller id — e.g. an appointment or rental id) + `buyer_email`, both
// indexed, so a later guest-account/OTP layer can list a buyer's payments with
// no migration. Extra state grows in `metadata_json`.
//
// `payment_events` dedupes Stripe webhook deliveries (Stripe retries; events may
// arrive more than once) — INSERT OR IGNORE on the Stripe event id.

export const schema = `
CREATE TABLE IF NOT EXISTS payments (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL,
  provider_ref     TEXT,
  kind             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  amount_value     INTEGER NOT NULL,
  amount_currency  TEXT NOT NULL,
  amount_precision INTEGER NOT NULL,
  captured_value   INTEGER,
  refunded_value   INTEGER,
  reference        TEXT,
  buyer_email      TEXT,
  buyer_name       TEXT,
  metadata_json    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_ref    ON payments (reference);
CREATE INDEX IF NOT EXISTS idx_payments_email  ON payments (buyer_email);
CREATE INDEX IF NOT EXISTS idx_payments_pref   ON payments (provider_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id    TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
`

// SQLite has no ADD COLUMN IF NOT EXISTS. New columns land here so instances with
// an older payments table get patched after exec(schema). Empty guards today —
// present so the growth pattern (mirroring migrateStock) is already in place.
export function migratePayments(db: Database): void {
  const cols = (db.prepare(`PRAGMA table_info(payments)`).all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!cols.includes('metadata_json')) db.exec(`ALTER TABLE payments ADD COLUMN metadata_json TEXT`)
}
