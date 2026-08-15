// Payments router — the server side of the payment seam. Charging a computed
// price goes through a PaymentProvider (see @muralink/payments), so the concrete
// processor is swappable. Offline-first: with nothing configured the Mock
// provider keeps the flow working. To enable real Stripe, set STRIPE_SECRET_KEY
// (the server owns the `stripe` SDK; no secret ever reaches the open package or
// the client).
//
// Two rails:
//   • /checkout      — immediate charge (hosted Checkout Session).
//   • /authorize     — a HOLD (fianza / deposit); later /capture or /void.
//   • /refund        — give settled money back.
// Every operation persists to the `payments` table (source of truth for amounts,
// which is what fixes the old getStatus amount:0 shortcut). Correlation is by
// `reference` + `buyer_email` for a future guest-account/OTP layer.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { isValidMoney, type YMoney } from '@muralink/types'
import {
  PaymentRegistry,
  MockPaymentProvider,
  StripePaymentProvider,
  type ChargeRequest,
} from '@muralink/payments'
import {
  insertPayment,
  updatePayment,
  getPaymentById,
  listByReference,
  listByBuyerEmail,
} from './queries.ts'

/** Build the active registry from env. Mock is always present as a fallback. */
export function buildPaymentRegistry(): PaymentRegistry {
  const registry = new PaymentRegistry([new MockPaymentProvider({ autoPay: false })])

  // ── Real Stripe (opt-in) ──────────────────────────────────────────────────
  // Enabled when STRIPE_SECRET_KEY is set. The `stripe` SDK is a dependency of
  // this platform package (not of @muralink/payments) and the adapter takes the
  // client injected, so the key stays here on the server. When present Stripe
  // becomes the registry default (PaymentRegistry.default()).
  const key = process.env['STRIPE_SECRET_KEY']
  if (key) {
    // The `stripe` SDK is CJS; createRequire loads it synchronously from this
    // ESM module (buildPaymentRegistry is called at server init, not async).
    const require = createRequire(import.meta.url)
    const Stripe = require('stripe') as new (k: string) => unknown
    registry.register(
      new StripePaymentProvider({
        // The real Stripe client structurally satisfies StripeLike.
        client: new Stripe(key) as never,
        defaultCurrency: 'eur',
      }),
    )
  }
  return registry
}

function nowIso(): string {
  return new Date().toISOString()
}

function validMoney(m: unknown): m is YMoney {
  return (
    !!m &&
    typeof m === 'object' &&
    typeof (m as YMoney).amount === 'number' &&
    typeof (m as YMoney).currency === 'string' &&
    typeof (m as YMoney).precision === 'number' &&
    isValidMoney(m as YMoney)
  )
}

export function createPaymentsRouter(registry: PaymentRegistry, db: Database): Router {
  const router = Router()

  // ── Immediate charge ────────────────────────────────────────────────────
  router.post('/checkout', async (req, res) => {
    const body = req.body as ChargeRequest & { provider?: string }
    if (!validMoney(body.amount)) {
      res.status(400).json({ error: 'amount (YMoney) required' })
      return
    }
    const provider = body.provider ? registry.get(body.provider) : registry.default()
    if (!provider) {
      res.status(400).json({ error: `unknown provider "${body.provider}"` })
      return
    }
    try {
      const session = await provider.createCheckout(body)
      const row = insertPayment(
        db,
        {
          id: randomUUID(),
          provider: session.provider,
          providerRef: session.id,
          kind: 'charge',
          status: session.status === 'paid' ? 'paid' : 'pending',
          amount: body.amount,
          reference: body.reference,
          buyerEmail: body.buyer?.email,
          buyerName: body.buyer?.name,
        },
        nowIso(),
      )
      res.status(201).json({ ...session, paymentId: row.id })
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'checkout failed' })
    }
  })

  router.get('/checkout/:id', async (req, res) => {
    const providerId = typeof req.query['provider'] === 'string' ? req.query['provider'] : undefined
    const provider = providerId ? registry.get(providerId) : registry.default()
    if (!provider) {
      res.status(400).json({ error: 'unknown provider' })
      return
    }
    try {
      const session = await provider.getStatus(req.params['id']!)
      // The persisted row is authoritative for the amount (fixes amount:0). Look
      // it up by provider_ref and overlay + sync status.
      const row = updatePayment(
        db,
        { providerRef: session.id },
        { status: session.status === 'paid' ? 'paid' : 'pending' },
        nowIso(),
      )
      res.json({ ...session, ...(row ? { amount: row.amount, paymentId: row.id } : {}) })
    } catch (e) {
      res.status(404).json({ error: e instanceof Error ? e.message : 'not found' })
    }
  })

  // ── Deposit / hold rail ───────────────────────────────────────────────────
  router.post('/authorize', async (req, res) => {
    const body = req.body as ChargeRequest & { provider?: string }
    if (!validMoney(body.amount)) {
      res.status(400).json({ error: 'amount (YMoney) required' })
      return
    }
    const provider = body.provider ? registry.get(body.provider) : registry.default()
    if (!provider) {
      res.status(400).json({ error: `unknown provider "${body.provider}"` })
      return
    }
    try {
      const rec = await provider.authorize(body)
      const row = insertPayment(
        db,
        {
          id: randomUUID(),
          provider: rec.provider,
          providerRef: rec.id,
          kind: 'deposit',
          status: rec.status,
          amount: body.amount,
          reference: body.reference,
          buyerEmail: body.buyer?.email,
          buyerName: body.buyer?.name,
        },
        nowIso(),
      )
      res.status(201).json({ ...rec, paymentId: row.id })
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'authorize failed' })
    }
  })

  router.post('/capture/:id', async (req, res) => {
    const { row, provider, error } = resolve(req.params['id']!)
    if (error) { res.status(error.code).json({ error: error.msg }); return }
    const amount = (req.body as { amount?: YMoney })?.amount
    if (amount !== undefined && !validMoney(amount)) {
      res.status(400).json({ error: 'amount must be a valid YMoney' })
      return
    }
    try {
      const rec = await provider!.capture(row!.providerRef!, amount)
      const updated = updatePayment(
        db,
        { id: row!.id },
        { status: rec.status, capturedValue: (rec.capturedAmount ?? amount ?? row!.amount).amount },
        nowIso(),
      )
      res.json(updated)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'capture failed' })
    }
  })

  router.post('/void/:id', async (req, res) => {
    const { row, provider, error } = resolve(req.params['id']!)
    if (error) { res.status(error.code).json({ error: error.msg }); return }
    try {
      const rec = await provider!.voidHold(row!.providerRef!)
      const updated = updatePayment(db, { id: row!.id }, { status: rec.status }, nowIso())
      res.json(updated)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'void failed' })
    }
  })

  router.post('/refund/:id', async (req, res) => {
    const { row, provider, error } = resolve(req.params['id']!)
    if (error) { res.status(error.code).json({ error: error.msg }); return }
    const amount = (req.body as { amount?: YMoney })?.amount
    if (amount !== undefined && !validMoney(amount)) {
      res.status(400).json({ error: 'amount must be a valid YMoney' })
      return
    }
    try {
      const rec = await provider!.refund(row!.providerRef!, amount)
      const updated = updatePayment(
        db,
        { id: row!.id },
        { status: rec.status, refundedValue: (rec.refundedAmount ?? amount ?? row!.amount).amount },
        nowIso(),
      )
      res.json(updated)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'refund failed' })
    }
  })

  // ── Correlation surface (for the future guest / OTP layer) ────────────────
  router.get('/payments', (req, res) => {
    const reference = typeof req.query['reference'] === 'string' ? req.query['reference'] : undefined
    const email = typeof req.query['email'] === 'string' ? req.query['email'] : undefined
    if (reference) { res.json(listByReference(db, reference)); return }
    if (email) { res.json(listByBuyerEmail(db, email)); return }
    res.status(400).json({ error: 'reference or email query param required' })
  })

  // Shared lookup for the capture/void/refund handlers: resolve our row + the
  // provider that owns it, or an error to return.
  function resolve(id: string): {
    row?: ReturnType<typeof getPaymentById>
    provider?: ReturnType<PaymentRegistry['get']>
    error?: { code: number; msg: string }
  } {
    const row = getPaymentById(db, id)
    if (!row) return { error: { code: 404, msg: 'payment not found' } }
    if (!row.providerRef) return { error: { code: 409, msg: 'payment has no provider ref' } }
    const provider = registry.get(row.provider)
    if (!provider) return { error: { code: 400, msg: `unknown provider "${row.provider}"` } }
    return { row, provider }
  }

  return router
}
