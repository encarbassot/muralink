// Payment adapter. Charging a computed price goes through the `PaymentProvider`
// seam so the concrete processor is swappable — Stripe today, anything later.
// The interface and the offline Mock live here (zero SDK deps). The Stripe
// adapter is here too but takes an INJECTED client, so this package never
// depends on the `stripe` SDK and never holds a secret key — the server injects
// a configured client. Local-first: with no provider configured the Mock keeps
// checkout working offline (useful for dev and for flows that don't truly pay).
//
// Two rails, one seam:
//   • Immediate charge → Checkout Session (`mode:'payment'`, hosted URL). Use
//     createCheckout/getStatus. Good for a public guest-link payment.
//   • Refundable deposit / fianza → PaymentIntent with capture_method:'manual'
//     (a HOLD you later capture or release). Use authorize → capture | voidHold.
// The server persists the outcome; this package is stateless (Mock aside) and
// never the source of truth for amounts.

import type { YMoney } from '@muralink/types'

/** A request to collect a payment for a computed amount. */
export interface ChargeRequest {
  amount: YMoney
  description?: string
  /** Opaque caller reference (e.g. a stock item id or order id) echoed back. */
  reference?: string
  buyer?: { email?: string; name?: string }
  /** Where to return the buyer after a hosted checkout. */
  successUrl?: string
  cancelUrl?: string
}

export type CheckoutStatus = 'pending' | 'paid' | 'failed' | 'canceled'

export interface CheckoutSession {
  id: string
  provider: string
  status: CheckoutStatus
  /** Hosted-checkout URL to redirect the buyer to (absent for Mock). */
  url?: string
  amount: YMoney
  reference?: string
}

// ── Deposits / holds ─────────────────────────────────────────────────────────
// A charge is settled money; a deposit is a HOLD that can be captured (partly or
// fully) or released. The richer PaymentStatus is the union both rails resolve
// into; the server row keys off it. `PaymentKind` tells a persisted row apart.

export type PaymentKind = 'charge' | 'deposit'

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'paid'
  | 'voided'
  | 'refunded'
  | 'partially_refunded'
  | 'failed'
  | 'canceled'

/** The result of a deposit-rail operation (authorize/capture/void/refund). */
export interface PaymentRecord {
  /** Provider ref: `pi_…` (Stripe PaymentIntent) or `mock_…`. */
  id: string
  provider: string
  kind: PaymentKind
  status: PaymentStatus
  /** Authorized / intended amount. */
  amount: YMoney
  /** Filled after (a possibly partial) capture. */
  capturedAmount?: YMoney
  /** Filled after (a possibly partial) refund. */
  refundedAmount?: YMoney
  /** PaymentIntent client_secret — for a future front-end confirm step. */
  clientSecret?: string
  /** Only for hosted charge sessions. */
  url?: string
  reference?: string
}

/** The seam every processor implements. Async by nature (network). */
export interface PaymentProvider {
  readonly id: string
  // Immediate-charge rail.
  createCheckout(req: ChargeRequest): Promise<CheckoutSession>
  getStatus(sessionId: string): Promise<CheckoutSession>
  // Deposit / hold rail. `voidHold` (not `void`) to stay clear of the operator.
  authorize(req: ChargeRequest): Promise<PaymentRecord>
  capture(id: string, amount?: YMoney): Promise<PaymentRecord>
  voidHold(id: string): Promise<PaymentRecord>
  refund(id: string, amount?: YMoney): Promise<PaymentRecord>
}

// Same-currency/precision zero used when composing partial amounts.
function money(amount: number, like: YMoney): YMoney {
  return { amount, currency: like.currency, precision: like.precision }
}

// ── Mock — offline, deterministic-ish, no network ───────────────────────────
// Marks charge sessions 'paid' immediately (dev) or 'pending' if `autoPay:false`.
// The deposit rail is a small state machine so the verify harness exercises real
// authorize→capture / authorize→void / refund transitions.
export interface MockConfig {
  autoPay?: boolean
  /** Injected id factory so the package needs no Math.random/Date at import. */
  newId?: () => string
}

export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock'
  private sessions = new Map<string, CheckoutSession>()
  private records = new Map<string, PaymentRecord>()
  private autoPay: boolean
  private newId: () => string
  private seq = 0

  constructor(cfg: MockConfig = {}) {
    this.autoPay = cfg.autoPay ?? true
    this.newId = cfg.newId ?? (() => `mock_${++this.seq}`)
  }

  async createCheckout(req: ChargeRequest): Promise<CheckoutSession> {
    const session: CheckoutSession = {
      id: this.newId(),
      provider: this.id,
      status: this.autoPay ? 'paid' : 'pending',
      amount: req.amount,
      ...(req.reference ? { reference: req.reference } : {}),
    }
    this.sessions.set(session.id, session)
    // Mirror charges into the record map so refund() can find them.
    this.records.set(session.id, {
      id: session.id,
      provider: this.id,
      kind: 'charge',
      status: session.status === 'paid' ? 'paid' : 'pending',
      amount: req.amount,
      ...(req.reference ? { reference: req.reference } : {}),
    })
    return session
  }

  async getStatus(sessionId: string): Promise<CheckoutSession> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`unknown session "${sessionId}"`)
    return s
  }

  async authorize(req: ChargeRequest): Promise<PaymentRecord> {
    const rec: PaymentRecord = {
      id: this.newId(),
      provider: this.id,
      kind: 'deposit',
      status: 'authorized',
      amount: req.amount,
      ...(req.reference ? { reference: req.reference } : {}),
    }
    this.records.set(rec.id, rec)
    return rec
  }

  async capture(id: string, amount?: YMoney): Promise<PaymentRecord> {
    const rec = this.mustGet(id)
    if (rec.status !== 'authorized') {
      throw new Error(`cannot capture "${id}" in status "${rec.status}"`)
    }
    const captured = amount ?? rec.amount
    const next: PaymentRecord = { ...rec, status: 'captured', capturedAmount: captured }
    this.records.set(id, next)
    return next
  }

  async voidHold(id: string): Promise<PaymentRecord> {
    const rec = this.mustGet(id)
    if (rec.status !== 'authorized') {
      throw new Error(`cannot void "${id}" in status "${rec.status}"`)
    }
    const next: PaymentRecord = { ...rec, status: 'voided' }
    this.records.set(id, next)
    return next
  }

  async refund(id: string, amount?: YMoney): Promise<PaymentRecord> {
    const rec = this.mustGet(id)
    if (rec.status !== 'captured' && rec.status !== 'paid' && rec.status !== 'partially_refunded') {
      throw new Error(`cannot refund "${id}" in status "${rec.status}"`)
    }
    const settled = rec.capturedAmount ?? rec.amount
    const already = rec.refundedAmount?.amount ?? 0
    // Default (no amount) refunds the remaining un-refunded balance.
    const thisRefund = amount ? amount.amount : settled.amount - already
    const total = already + thisRefund
    const full = total >= settled.amount
    const next: PaymentRecord = {
      ...rec,
      status: full ? 'refunded' : 'partially_refunded',
      refundedAmount: money(total, settled),
    }
    this.records.set(id, next)
    return next
  }

  private mustGet(id: string): PaymentRecord {
    const rec = this.records.get(id)
    if (!rec) throw new Error(`unknown payment "${id}"`)
    return rec
  }
}

// ── Stripe — client injected, no SDK dep in this package ─────────────────────
// The minimal shape we use from the Stripe SDK. The server constructs the real
// `new Stripe(secretKey)` and passes it in; it structurally satisfies this.
export interface StripeLike {
  checkout: {
    sessions: {
      create(params: unknown): Promise<{ id: string; url?: string | null; payment_status?: string; amount_total?: number | null }>
      retrieve(id: string): Promise<{ id: string; url?: string | null; payment_status?: string; amount_total?: number | null }>
    }
  }
  paymentIntents: {
    create(params: unknown): Promise<StripeIntent>
    capture(id: string, params?: unknown): Promise<StripeIntent>
    cancel(id: string): Promise<StripeIntent>
    retrieve(id: string): Promise<StripeIntent>
  }
  refunds: {
    create(params: unknown): Promise<{ id: string; status?: string | null; amount?: number | null }>
  }
  webhooks: {
    constructEvent(payload: string | Buffer, sig: string, secret: string): StripeEvent
  }
}

export interface StripeIntent {
  id: string
  status: string
  client_secret?: string | null
  amount?: number | null
  amount_received?: number | null
  currency?: string | null
}

export interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export interface StripeConfig {
  client: StripeLike
  /** YMoney currency default when the provider must synthesize one. */
  defaultCurrency?: string
}

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe'
  constructor(private readonly cfg: StripeConfig) {}

  /** Verify a raw webhook payload against the signing secret and return the
   *  typed event. Throws if the signature is invalid. */
  verifyWebhook(payload: string | Buffer, signature: string, secret: string): StripeEvent {
    return this.cfg.client.webhooks.constructEvent(payload, signature, secret)
  }

  async createCheckout(req: ChargeRequest): Promise<CheckoutSession> {
    const unitAmount = toStripeMinorUnits(req.amount)
    const s = await this.cfg.client.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.amount.currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: { name: req.description ?? req.reference ?? 'Charge' },
          },
        },
      ],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.reference,
      customer_email: req.buyer?.email,
      metadata: { reference: req.reference ?? '', buyer_email: req.buyer?.email ?? '' },
    })
    return {
      id: s.id,
      provider: this.id,
      status: mapStripeStatus(s.payment_status),
      ...(s.url ? { url: s.url } : {}),
      amount: req.amount,
      ...(req.reference ? { reference: req.reference } : {}),
    }
  }

  async getStatus(sessionId: string): Promise<CheckoutSession> {
    const s = await this.cfg.client.checkout.sessions.retrieve(sessionId)
    // Amount comes from `amount_total` when Stripe echoes it; otherwise the
    // server row is authoritative and overlays it (no more hardcoded 0).
    const amount: YMoney =
      s.amount_total != null
        ? { amount: fromStripeMinorUnits(s.amount_total), currency: (this.cfg.defaultCurrency ?? 'eur'), precision: 2 }
        : { amount: 0, currency: this.cfg.defaultCurrency ?? 'eur', precision: 2 }
    return {
      id: s.id,
      provider: this.id,
      status: mapStripeStatus(s.payment_status),
      ...(s.url ? { url: s.url } : {}),
      amount,
    }
  }

  async authorize(req: ChargeRequest): Promise<PaymentRecord> {
    const intent = await this.cfg.client.paymentIntents.create({
      amount: toStripeMinorUnits(req.amount),
      currency: req.amount.currency.toLowerCase(),
      capture_method: 'manual',
      description: req.description,
      receipt_email: req.buyer?.email,
      metadata: { reference: req.reference ?? '', buyer_email: req.buyer?.email ?? '' },
    })
    return {
      id: intent.id,
      provider: this.id,
      kind: 'deposit',
      status: mapIntentStatus(intent.status),
      amount: req.amount,
      ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}),
      ...(req.reference ? { reference: req.reference } : {}),
    }
  }

  async capture(id: string, amount?: YMoney): Promise<PaymentRecord> {
    const intent = await this.cfg.client.paymentIntents.capture(
      id,
      amount ? { amount_to_capture: toStripeMinorUnits(amount) } : undefined,
    )
    return this.intentToRecord(intent, { capturedAmount: amount })
  }

  async voidHold(id: string): Promise<PaymentRecord> {
    const intent = await this.cfg.client.paymentIntents.cancel(id)
    return this.intentToRecord(intent)
  }

  async refund(id: string, amount?: YMoney): Promise<PaymentRecord> {
    const r = await this.cfg.client.refunds.create({
      payment_intent: id,
      ...(amount ? { amount: toStripeMinorUnits(amount) } : {}),
    })
    // Refund object doesn't carry the full picture; the row/webhook reconciles
    // partial vs full. Report the requested amount when given.
    const status: PaymentStatus = amount ? 'partially_refunded' : 'refunded'
    return {
      id,
      provider: this.id,
      kind: 'deposit',
      status,
      amount: amount ?? money(r.amount ? fromStripeMinorUnits(r.amount) : 0, { amount: 0, currency: this.cfg.defaultCurrency ?? 'eur', precision: 2 }),
      ...(amount ? { refundedAmount: amount } : {}),
    }
  }

  private intentToRecord(intent: StripeIntent, extra?: { capturedAmount?: YMoney }): PaymentRecord {
    const currency = (intent.currency ?? this.cfg.defaultCurrency ?? 'eur').toLowerCase()
    const amount: YMoney = {
      amount: intent.amount != null ? fromStripeMinorUnits(intent.amount) : 0,
      currency,
      precision: 2,
    }
    const captured =
      extra?.capturedAmount ??
      (intent.amount_received != null
        ? { amount: fromStripeMinorUnits(intent.amount_received), currency, precision: 2 }
        : undefined)
    return {
      id: intent.id,
      provider: this.id,
      kind: 'deposit',
      status: mapIntentStatus(intent.status),
      amount,
      ...(captured ? { capturedAmount: captured } : {}),
    }
  }
}

// Stripe wants an integer in the currency's smallest unit. YMoney already stores
// integer minor units at `precision`; Stripe uses 2 for most currencies, so
// rescale from our precision to 2. NOTE: zero-decimal (JPY) / 3-decimal (BHD)
// currencies need a per-currency exponent — the `2` is centralized here so it's
// the single place to fix when we go beyond EUR-like currencies.
const STRIPE_EXPONENT = 2

export function toStripeMinorUnits(m: YMoney): number {
  return Math.round(m.amount * Math.pow(10, STRIPE_EXPONENT - m.precision))
}

/** Inverse of toStripeMinorUnits, back to a precision-2 YMoney minor amount. */
export function fromStripeMinorUnits(n: number): number {
  return n
}

function mapStripeStatus(s: string | undefined): CheckoutStatus {
  switch (s) {
    case 'paid':
      return 'paid'
    case 'unpaid':
    case 'no_payment_required':
      return 'pending'
    default:
      return 'pending'
  }
}

/** Map a Stripe PaymentIntent status into our PaymentStatus. */
export function mapIntentStatus(s: string | undefined): PaymentStatus {
  switch (s) {
    case 'requires_capture':
      return 'authorized'
    case 'succeeded':
      return 'captured'
    case 'canceled':
      return 'voided'
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_payment_method':
      return 'pending'
    default:
      return 'pending'
  }
}

// A tiny registry so a host can pick the active provider by id, defaulting to
// Mock when nothing is configured (offline-first).
export class PaymentRegistry {
  private providers = new Map<string, PaymentProvider>()
  constructor(providers: PaymentProvider[] = [new MockPaymentProvider()]) {
    for (const p of providers) this.providers.set(p.id, p)
  }
  register(p: PaymentProvider): void {
    this.providers.set(p.id, p)
  }
  get(id: string): PaymentProvider | undefined {
    return this.providers.get(id)
  }
  /** The configured default: Stripe if present, else Mock. */
  default(): PaymentProvider {
    return this.providers.get('stripe') ?? this.providers.get('mock') ?? [...this.providers.values()][0]!
  }
}
