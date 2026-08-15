// Pricing + payment verification (repo has no test runner). Run from repo root:
//   npx tsx modules/stock/verify.ts

import { computePricing, computePricingWith } from './pricing.ts'
import type { YPricing, PricingContext } from './types.ts'
import { MockPaymentProvider, StripePaymentProvider, toStripeMinorUnits, type StripeLike } from '@muralink/payments'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`) }
}

const eur = (amount: number) => ({ amount, currency: 'EUR', precision: 2 })
const ctx: PricingContext = { quantity: 1, date: '2026-07-25' }

async function main(): Promise<void> {
  // trio: base+gain
  {
    const p: YPricing = { base: eur(1000), gainPct: 15, driver: 'base+gain', rules: [] }
    const r = computePricing(p, ctx)
    check('base+gain listFinal 11.50', r.listFinal, eur(1150))
    check('base+gain final (no rules)', r.final, eur(1150))
  }
  // trio: base+final derives gain
  {
    const p: YPricing = { base: eur(1000), gainPct: 0, driver: 'base+final', finalOverride: eur(1200), rules: [] }
    check('base+final derives gainPct 20', computePricing(p, ctx).gainPct, 20)
  }
  // trio: gain+final derives base (12.00 final at 20% gain → base 10.00)
  {
    const p: YPricing = { base: eur(0), gainPct: 20, driver: 'gain+final', finalOverride: eur(1200), rules: [] }
    const r = computePricing(p, ctx)
    check('gain+final derives base 10.00', r.base, eur(1000))
    check('gain+final listFinal 12.00', r.listFinal, eur(1200))
  }
  // membership discount rule
  {
    const p: YPricing = {
      base: eur(1000), gainPct: 15, driver: 'base+gain',
      rules: [{ id: 'r1', mode: 'blocks',
        when: [{ t: 'isMember', who: { t: 'input', name: 'buyer' }, list: { t: 'listRef', ref: { type: 'list', id: 'vip' } } }],
        then: [{ t: 'applyDiscount', pct: { t: 'literal', v: 15 } }] }],
    }
    const withBuyer: PricingContext = { quantity: 1, date: '2026-07-25', buyer: { type: 'contact', id: 'c1' } }
    const member = computePricingWith(p, withBuyer, (listId, ref) => listId === 'list:vip' && ref.id === 'c1')
    check('member discount final 9.78', member.final, eur(978))
    check('member applied rule', member.appliedRuleIds, ['r1'])
    check('non-member no discount', computePricingWith(p, withBuyer, () => false).final, eur(1150))
  }
  // payments: mock
  {
    const s = await new MockPaymentProvider({ autoPay: true }).createCheckout({ amount: eur(1150), reference: 'item1' })
    check('mock paid', s.status, 'paid')
    check('mock echoes ref', s.reference, 'item1')
  }
  // payments: stripe adapter with injected fake client
  {
    const fake: StripeLike = {
      checkout: { sessions: {
        async create() { return { id: 'cs_1', url: 'https://stripe/cs_1', payment_status: 'unpaid' } },
        async retrieve(id: string) { return { id, url: null, payment_status: 'paid' } },
      } },
      // Deposit rail (unused by these pricing/charge checks) — stubbed so the
      // fake satisfies the StripeLike seam.
      paymentIntents: {
        async create() { return { id: 'pi_1', status: 'requires_capture' } },
        async capture(id: string) { return { id, status: 'succeeded' } },
        async cancel(id: string) { return { id, status: 'canceled' } },
        async retrieve(id: string) { return { id, status: 'requires_capture' } },
      },
      refunds: { async create() { return { id: 're_1', status: 'succeeded', amount: 0 } } },
      webhooks: { constructEvent() { return { id: 'evt_1', type: 'noop', data: { object: {} } } } },
    }
    const stripe = new StripePaymentProvider({ client: fake })
    const s = await stripe.createCheckout({ amount: eur(1150), reference: 'item1', description: 'Widget' })
    check('stripe session url', s.url, 'https://stripe/cs_1')
    check('stripe minor units 1150', toStripeMinorUnits(eur(1150)), 1150)
    check('stripe retrieve paid', (await stripe.getStatus('cs_1')).status, 'paid')
  }

  console.log(`stock pricing+payments: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()
