# @muralink/payments

The payment seam. A stack-agnostic `PaymentProvider` interface, an offline mock,
and a Stripe adapter — so charging a computed price never hardcodes a processor.

## The interface

```ts
interface PaymentProvider {
  readonly id: string
  // immediate charge
  createCheckout(req: ChargeRequest): Promise<CheckoutSession>
  getStatus(sessionId: string): Promise<CheckoutSession>
  // deposit / hold
  authorize(req: ChargeRequest): Promise<PaymentRecord>
  capture(id: string, amount?: YMoney): Promise<PaymentRecord>
  voidHold(id: string): Promise<PaymentRecord>
  refund(id: string, amount?: YMoney): Promise<PaymentRecord>
}
```

Two rails, because a booking deposit and a shop checkout are genuinely different
flows: one holds and later captures, the other charges once.

## Rules

- **No SDK dependency here.** The Stripe adapter takes an injected client. This
  package depends on `@muralink/types` and nothing else.
- **Amounts are `YMoney`** — amount, currency and precision travel together.
  Never a bare float: rounding a price is a decision, not an accident.
- **Secret keys stay server-side.** Nothing in this package should ever be
  reachable from a bundle shipped to a browser.
- **The single-user core stays payment-agnostic.** A module computes what
  something costs; this seam is how that number reaches a processor, if there is
  one at all.
