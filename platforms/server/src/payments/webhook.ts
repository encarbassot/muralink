// Stripe webhook handler. Stripe is the source of truth for async settlement:
// a hold going live, a capture succeeding, a refund landing all arrive here
// rather than being inferred from the client. We reconcile the persisted row.
//
// TWO constraints make this a standalone handler (not part of the router):
//   1. Signature verification needs the RAW request bytes, so it must be mounted
//      with express.raw() BEFORE the global express.json() in index.ts.
//   2. It authenticates via the Stripe signature, not a bearer token, so it is
//      mounted BEFORE authMiddleware (same precedent as /api/__presence).
//
// Idempotency: Stripe retries and may deliver an event more than once. We dedupe
// on the Stripe event id (payment_events table) and always answer 200 after
// handling so Stripe stops retrying.

import type { Request, Response } from 'express'
import type { Database } from 'better-sqlite3'
import {
  StripePaymentProvider,
  mapIntentStatus,
  type PaymentRegistry,
  type PaymentStatus,
  type StripeEvent,
} from '@muralink/payments'
import { updatePayment, recordEventOnce, getByProviderRef } from './queries.ts'

function nowIso(): string {
  return new Date().toISOString()
}

type Handler = (req: Request, res: Response) => void

export function createPaymentsWebhookHandler(registry: PaymentRegistry, db: Database): Handler {
  const secret = process.env['STRIPE_WEBHOOK_SECRET']
  const stripe = registry.get('stripe')

  return (req: Request, res: Response): void => {
    // No Stripe configured → nothing to verify against. Accept-and-ignore so a
    // Mock/offline deployment doesn't 500 if a webhook ever reaches it.
    if (!secret || !(stripe instanceof StripePaymentProvider)) {
      res.status(200).json({ ok: true, ignored: 'stripe not configured' })
      return
    }

    const signature = req.header('stripe-signature')
    if (!signature) {
      res.status(400).json({ error: 'missing stripe-signature' })
      return
    }

    let event: StripeEvent
    try {
      // req.body is the raw Buffer here (express.raw mount) — required by Stripe.
      event = stripe.verifyWebhook(req.body as Buffer, signature, secret)
    } catch (e) {
      res.status(400).json({ error: `signature verification failed: ${e instanceof Error ? e.message : 'bad signature'}` })
      return
    }

    // Idempotency: if we've seen this event id, ACK and stop.
    if (!recordEventOnce(db, event.id, nowIso())) {
      res.status(200).json({ ok: true, duplicate: true })
      return
    }

    try {
      applyEvent(db, event)
    } catch {
      // Swallow — we still 200 so Stripe stops retrying; the row simply stays as
      // it was. (A failed reconcile is observable via the row's status/updated_at.)
    }
    res.status(200).json({ ok: true })
  }
}

function applyEvent(db: Database, event: StripeEvent): void {
  const obj = event.data.object as Record<string, unknown>
  const providerRef = String(obj['id'] ?? '')
  if (!providerRef) return

  const patch = statusPatchFor(event.type, obj)
  if (!patch) return
  // Only touch a row we actually have (a checkout.session ref vs a
  // payment_intent ref — resolve by whichever provider_ref matches).
  const row = getByProviderRef(db, providerRef)
  if (!row) return
  updatePayment(db, { id: row.id }, patch, nowIso())
}

function statusPatchFor(
  type: string,
  obj: Record<string, unknown>,
): { status: PaymentStatus; capturedValue?: number; refundedValue?: number } | null {
  switch (type) {
    case 'checkout.session.completed':
      return { status: 'paid' }
    case 'payment_intent.amount_capturable_updated':
      return { status: 'authorized' }
    case 'payment_intent.succeeded': {
      const received = num(obj['amount_received'])
      return { status: 'captured', ...(received != null ? { capturedValue: received } : {}) }
    }
    case 'payment_intent.canceled':
      return { status: 'voided' }
    case 'payment_intent.payment_failed':
      return { status: 'failed' }
    case 'charge.refunded': {
      const amount = num(obj['amount'])
      const refunded = num(obj['amount_refunded'])
      const full = amount != null && refunded != null ? refunded >= amount : true
      return {
        status: full ? 'refunded' : 'partially_refunded',
        ...(refunded != null ? { refundedValue: refunded } : {}),
      }
    }
    default:
      // Fall back to the intent-status mapping when the object carries one.
      if (typeof obj['status'] === 'string') {
        const mapped = mapIntentStatus(obj['status'])
        if (mapped !== 'pending') return { status: mapped }
      }
      return null
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}
