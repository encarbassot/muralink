import type { Database } from 'better-sqlite3'
import type { YMoney } from '@muralink/types'
import type { PaymentKind, PaymentStatus } from '@muralink/payments'

// The persisted view of a payment. Amounts are split into value/currency/
// precision columns (like stock's price_*), reassembled to YMoney on read.
export interface PaymentRow {
  id: string
  provider: string
  providerRef?: string
  kind: PaymentKind
  status: PaymentStatus
  amount: YMoney
  capturedAmount?: YMoney
  refundedAmount?: YMoney
  reference?: string
  buyerEmail?: string
  buyerName?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface RawRow {
  id: string
  provider: string
  provider_ref: string | null
  kind: string
  status: string
  amount_value: number
  amount_currency: string
  amount_precision: number
  captured_value: number | null
  refunded_value: number | null
  reference: string | null
  buyer_email: string | null
  buyer_name: string | null
  metadata_json: string | null
  created_at: string
  updated_at: string
}

function rowToPayment(r: RawRow): PaymentRow {
  const money = (v: number): YMoney => ({
    amount: v,
    currency: r.amount_currency,
    precision: r.amount_precision,
  })
  return {
    id: r.id,
    provider: r.provider,
    providerRef: r.provider_ref ?? undefined,
    kind: r.kind as PaymentKind,
    status: r.status as PaymentStatus,
    amount: money(r.amount_value),
    capturedAmount: r.captured_value != null ? money(r.captured_value) : undefined,
    refundedAmount: r.refunded_value != null ? money(r.refunded_value) : undefined,
    reference: r.reference ?? undefined,
    buyerEmail: r.buyer_email ?? undefined,
    buyerName: r.buyer_name ?? undefined,
    metadata: r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface InsertPaymentInput {
  id: string
  provider: string
  providerRef?: string
  kind: PaymentKind
  status: PaymentStatus
  amount: YMoney
  reference?: string
  buyerEmail?: string
  buyerName?: string
  metadata?: Record<string, unknown>
}

export function insertPayment(db: Database, p: InsertPaymentInput, nowIso: string): PaymentRow {
  db.prepare(
    `INSERT INTO payments
       (id, provider, provider_ref, kind, status,
        amount_value, amount_currency, amount_precision,
        reference, buyer_email, buyer_name, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.provider,
    p.providerRef ?? null,
    p.kind,
    p.status,
    p.amount.amount,
    p.amount.currency,
    p.amount.precision,
    p.reference ?? null,
    p.buyerEmail ?? null,
    p.buyerName ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    nowIso,
    nowIso,
  )
  return getPaymentById(db, p.id)!
}

export interface PaymentPatch {
  status?: PaymentStatus
  providerRef?: string
  capturedValue?: number
  refundedValue?: number
}

/** Update by our id or by provider_ref (the webhook only knows the Stripe id). */
export function updatePayment(
  db: Database,
  key: { id: string } | { providerRef: string },
  patch: PaymentPatch,
  nowIso: string,
): PaymentRow | undefined {
  const existing =
    'id' in key ? getPaymentById(db, key.id) : getByProviderRef(db, key.providerRef)
  if (!existing) return undefined
  const status = patch.status ?? existing.status
  const providerRef = patch.providerRef ?? existing.providerRef ?? null
  const capturedValue =
    patch.capturedValue ?? existing.capturedAmount?.amount ?? null
  const refundedValue =
    patch.refundedValue ?? existing.refundedAmount?.amount ?? null
  db.prepare(
    `UPDATE payments
        SET status = ?, provider_ref = ?, captured_value = ?, refunded_value = ?, updated_at = ?
      WHERE id = ?`,
  ).run(status, providerRef, capturedValue, refundedValue, nowIso, existing.id)
  return getPaymentById(db, existing.id)
}

export function getPaymentById(db: Database, id: string): PaymentRow | undefined {
  const r = db.prepare<[string], RawRow>(`SELECT * FROM payments WHERE id = ?`).get(id)
  return r ? rowToPayment(r) : undefined
}

export function getByProviderRef(db: Database, providerRef: string): PaymentRow | undefined {
  const r = db
    .prepare<[string], RawRow>(`SELECT * FROM payments WHERE provider_ref = ?`)
    .get(providerRef)
  return r ? rowToPayment(r) : undefined
}

export function listByReference(db: Database, reference: string): PaymentRow[] {
  return db
    .prepare<[string], RawRow>(`SELECT * FROM payments WHERE reference = ? ORDER BY created_at DESC`)
    .all(reference)
    .map(rowToPayment)
}

export function listByBuyerEmail(db: Database, email: string): PaymentRow[] {
  return db
    .prepare<[string], RawRow>(`SELECT * FROM payments WHERE buyer_email = ? ORDER BY created_at DESC`)
    .all(email)
    .map(rowToPayment)
}

/** Webhook idempotency: true if this event id is new (and now recorded). */
export function recordEventOnce(db: Database, eventId: string, nowIso: string): boolean {
  const res = db
    .prepare(`INSERT OR IGNORE INTO payment_events (event_id, received_at) VALUES (?, ?)`)
    .run(eventId, nowIso)
  return res.changes > 0
}
