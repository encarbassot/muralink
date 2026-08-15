// Payment seam verification (repo has no test runner). Run from this package:
//   npm run verify -w @muralink/payments      (or: npx tsx packages/payments/verify.ts)
//
// Covers the Mock state machine (authorize→capture/void, refund, rejections) and
// the Stripe adapter's status mapping + unit conversion against a fake client.

import {
  MockPaymentProvider,
  StripePaymentProvider,
  toStripeMinorUnits,
  mapIntentStatus,
  type StripeLike,
  type StripeIntent,
} from './src/index.ts'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`) }
}
async function rejects(name: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); fail++; console.log(`  FAIL ${name}: expected throw`) }
  catch { pass++ }
}

const eur = (amount: number) => ({ amount, currency: 'EUR', precision: 2 })

async function main(): Promise<void> {
  // ── Mock: authorize → capture (full) ──────────────────────────────────────
  {
    const p = new MockPaymentProvider({ newId: (() => { let n = 0; return () => `m_${++n}` })() })
    const held = await p.authorize({ amount: eur(5000), reference: 'rent1' })
    check('authorize status', held.status, 'authorized')
    check('authorize kind', held.kind, 'deposit')
    check('authorize echoes ref', held.reference, 'rent1')
    const cap = await p.capture(held.id)
    check('capture status', cap.status, 'captured')
    check('capture full amount', cap.capturedAmount, eur(5000))
  }

  // ── Mock: authorize → capture (partial) ───────────────────────────────────
  {
    const p = new MockPaymentProvider()
    const held = await p.authorize({ amount: eur(5000) })
    const cap = await p.capture(held.id, eur(2000))
    check('partial capture status', cap.status, 'captured')
    check('partial captured amount', cap.capturedAmount, eur(2000))
  }

  // ── Mock: authorize → void; capture after void rejects ────────────────────
  {
    const p = new MockPaymentProvider()
    const held = await p.authorize({ amount: eur(5000) })
    const voided = await p.voidHold(held.id)
    check('void status', voided.status, 'voided')
    await rejects('capture after void', () => p.capture(held.id))
    await rejects('void after void', () => p.voidHold(held.id))
  }

  // ── Mock: charge → refund (partial → rest) ────────────────────────────────
  {
    const p = new MockPaymentProvider({ autoPay: true })
    const s = await p.createCheckout({ amount: eur(1000), reference: 'order1' })
    check('charge paid', s.status, 'paid')
    const r1 = await p.refund(s.id, eur(400))
    check('partial refund status', r1.status, 'partially_refunded')
    check('partial refund amount', r1.refundedAmount, eur(400))
    const r2 = await p.refund(s.id)
    check('full refund status', r2.status, 'refunded')
  }

  // ── Mock: refund before capture rejects ───────────────────────────────────
  {
    const p = new MockPaymentProvider()
    const held = await p.authorize({ amount: eur(5000) })
    await rejects('refund before capture', () => p.refund(held.id))
    await rejects('capture unknown id', () => p.capture('nope'))
  }

  // ── Stripe adapter: hold rail against a fake client ───────────────────────
  {
    const intents: Record<string, StripeIntent> = {}
    let seq = 0
    const fake: StripeLike = {
      checkout: { sessions: {
        async create() { return { id: 'cs_1', url: 'https://stripe/cs_1', payment_status: 'unpaid', amount_total: 1150 } },
        async retrieve(id: string) { return { id, url: null, payment_status: 'paid', amount_total: 1150 } },
      } },
      paymentIntents: {
        async create(params: unknown) {
          const p = params as { amount: number; currency: string }
          const id = `pi_${++seq}`
          intents[id] = { id, status: 'requires_capture', client_secret: `${id}_secret`, amount: p.amount, currency: p.currency }
          return intents[id]!
        },
        async capture(id: string, params?: unknown) {
          const cap = (params as { amount_to_capture?: number } | undefined)?.amount_to_capture
          const it = intents[id]!
          it.status = 'succeeded'; it.amount_received = cap ?? it.amount
          return it
        },
        async cancel(id: string) { const it = intents[id]!; it.status = 'canceled'; return it },
        async retrieve(id: string) { return intents[id]! },
      },
      refunds: { async create() { return { id: 're_1', status: 'succeeded', amount: 400 } } },
      webhooks: { constructEvent() { return { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } } } },
    }
    const stripe = new StripePaymentProvider({ client: fake, defaultCurrency: 'eur' })

    check('unit conversion 1150', toStripeMinorUnits(eur(1150)), 1150)
    check('mapIntentStatus requires_capture', mapIntentStatus('requires_capture'), 'authorized')
    check('mapIntentStatus succeeded', mapIntentStatus('succeeded'), 'captured')
    check('mapIntentStatus canceled', mapIntentStatus('canceled'), 'voided')

    const held = await stripe.authorize({ amount: eur(5000), reference: 'rent9' })
    check('stripe authorize status', held.status, 'authorized')
    check('stripe authorize clientSecret', held.clientSecret, 'pi_1_secret')
    const cap = await stripe.capture(held.id, eur(2000))
    check('stripe capture status', cap.status, 'captured')
    check('stripe capture amount', cap.capturedAmount, eur(2000))

    const held2 = await stripe.authorize({ amount: eur(5000) })
    const voided = await stripe.voidHold(held2.id)
    check('stripe void status', voided.status, 'voided')

    // Charge status now reads a real amount (no more hardcoded 0).
    const s = await stripe.createCheckout({ amount: eur(1150), reference: 'x', description: 'Widget' })
    check('stripe checkout url', s.url, 'https://stripe/cs_1')
    const st = await stripe.getStatus('cs_1')
    check('stripe getStatus paid', st.status, 'paid')
    check('stripe getStatus amount not zero', st.amount.amount, 1150)
  }

  console.log(`payments seam: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()
