// Pricing math — the base/gain/final trio + deterministic rule folding. Pure and
// deterministic (no Date/random; the clock comes from PricingContext.date), so it
// runs identically on web and server. Money is integer-safe minor units
// (YMoney.amount / 10^precision), so every derivation rounds back to the base
// precision — the "normalize to precision" step that keeps float drift out of
// persisted prices.

import type { YMoney } from '@muralink/types'
import { evalRule, type RuleContext } from '@muralink/calc/blocks'
import type { YPricing, PricingContext } from './types.ts'

const real = (m: YMoney): number => m.amount / Math.pow(10, m.precision)
const money = (value: number, like: YMoney): YMoney => ({
  amount: Math.round(value * Math.pow(10, like.precision)),
  currency: like.currency,
  precision: like.precision,
})
// Round a derived DISPLAY number to 6 decimals to shed IEEE noise.
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6

export interface PricingResult {
  base: YMoney
  gainPct: number
  /** Final BEFORE rules — the trio result. */
  listFinal: YMoney
  /** Final AFTER folding all applicable rules against the context. */
  final: YMoney
  /** Which rules fired, for display/audit. */
  appliedRuleIds: string[]
}

/** Solve the trio from its two driving inputs, then fold rules over the result. */
export function computePricing(pricing: YPricing, ctx: PricingContext): PricingResult {
  // 1. Resolve the trio per driver (bounded 3-cell solve, not a general inverse).
  //    Two of {base, gain, final} are inputs; the third is derived. Derived
  //    display values are rounded to shed IEEE noise (0.2*100 = 19.9999…).
  let baseVal = real(pricing.base)
  let gainPct = pricing.gainPct
  let listFinalVal: number
  switch (pricing.driver) {
    case 'base+gain':
      listFinalVal = baseVal * (1 + gainPct / 100)
      break
    case 'base+final': {
      const f = pricing.finalOverride ? real(pricing.finalOverride) : baseVal
      listFinalVal = f
      gainPct = baseVal === 0 ? 0 : round6((f / baseVal - 1) * 100)
      break
    }
    case 'gain+final': {
      // gain + final given → derive base = final / (1 + gain/100).
      const f = pricing.finalOverride ? real(pricing.finalOverride) : baseVal
      listFinalVal = f
      const denom = 1 + gainPct / 100
      baseVal = denom === 0 ? f : round6(f / denom)
      break
    }
  }

  const base = money(baseVal, pricing.base)
  const listFinal = money(listFinalVal, pricing.base)

  // 2. Fold rules. Each rule contributes a multiplicative factor when it applies.
  const rctx: RuleContext = {
    inputs: {
      base: baseVal,
      gain: gainPct,
      quantity: ctx.quantity,
      startDate: ctx.date,
      ...(ctx.buyer ? { buyer: `${ctx.buyer.type}:${ctx.buyer.id}` } : {}),
    },
    refs: ctx.buyer ? { buyer: ctx.buyer } : {},
    // Membership is resolved by the caller/host and injected; default: no lists.
    isMember: () => false,
    now: ctx.date,
  }

  let finalVal = listFinalVal
  const appliedRuleIds: string[] = []
  for (const rule of pricing.rules) {
    const r = evalRule(rule, rctx)
    if (r.applied) {
      finalVal *= r.factor
      appliedRuleIds.push(rule.id)
    }
  }

  return { base, gainPct, listFinal, final: money(finalVal, base), appliedRuleIds }
}

/** Overload that injects a real membership resolver (used at the share/checkout
 *  boundary where a buyer and virtual lists exist). */
export function computePricingWith(
  pricing: YPricing,
  ctx: PricingContext,
  isMember: RuleContext['isMember'],
): PricingResult {
  const baseVal = real(pricing.base)
  const rctx: RuleContext = {
    inputs: {
      base: baseVal,
      gain: pricing.gainPct,
      quantity: ctx.quantity,
      startDate: ctx.date,
      ...(ctx.buyer ? { buyer: `${ctx.buyer.type}:${ctx.buyer.id}` } : {}),
    },
    refs: ctx.buyer ? { buyer: ctx.buyer } : {},
    isMember,
    now: ctx.date,
  }
  // Reuse the trio solve, then re-fold with the real membership resolver.
  const trio = computePricing({ ...pricing, rules: [] }, ctx)
  let finalVal = real(trio.listFinal)
  const appliedRuleIds: string[] = []
  for (const rule of pricing.rules) {
    const r = evalRule(rule, rctx)
    if (r.applied) {
      finalVal *= r.factor
      appliedRuleIds.push(rule.id)
    }
  }
  return { ...trio, final: money(finalVal, pricing.base), appliedRuleIds }
}
