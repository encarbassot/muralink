import { type CSSProperties } from 'react'
import type { YMoney } from '@muralink/types'
import type { RuleBlock } from '@muralink/calc/blocks'
import type { YPricing } from '../../../types.ts'
import { computePricing } from '../../../pricing.ts'
import { RuleBuilder } from './RuleBuilder.tsx'

// The Excel-like price editor: base → gain% → final, where editing any of the
// three recomputes the others (via the `driver`), plus the deterministic rule
// list. Presentational: it owns no persistence, just emits a new YPricing.

interface Props {
  pricing?: YPricing
  currency?: string
  onChange: (pricing: YPricing | undefined) => void
}

const PREC = 2

function toStr(m: YMoney | undefined): string {
  if (!m) return ''
  return (m.amount / Math.pow(10, m.precision)).toFixed(m.precision)
}
function toMoney(s: string, currency: string): YMoney {
  const n = Number(s)
  return { amount: Math.round((Number.isFinite(n) ? n : 0) * Math.pow(10, PREC)), currency, precision: PREC }
}

const label: CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)',
}
const input: CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13,
  outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box', width: '100%',
}

export function PricingEditor({ pricing, currency = 'EUR', onChange }: Props) {
  if (!pricing) {
    return (
      <button
        onClick={() => onChange({ base: toMoney('0', currency), gainPct: 0, driver: 'base+gain', rules: [] })}
        style={{ border: '1px dashed var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 8, cursor: 'pointer', fontSize: 12, padding: '8px 14px', alignSelf: 'flex-start' }}
      >
        + Añadir precio
      </button>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = computePricing(pricing, { quantity: 1, date: today })
  const cur = pricing.base.currency

  // Edits recompute the trio by switching the driver appropriately.
  const setBase = (s: string) => onChange({ ...pricing, base: toMoney(s, cur), driver: 'base+gain' })
  const setGain = (s: string) => onChange({ ...pricing, gainPct: Number(s) || 0, driver: 'base+gain' })
  const setFinal = (s: string) => onChange({ ...pricing, driver: 'base+final', finalOverride: toMoney(s, cur) })
  const setRules = (rules: RuleBlock[]) => onChange({ ...pricing, rules })

  const rulesChangeFinal = result.final.amount !== result.listFinal.amount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>Precio</span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{driverLabel(pricing.driver)}</span>
        <button onClick={() => onChange(undefined)} title="Quitar precio"
          style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}>
          <span style={label}>Base ({cur})</span>
          <input style={input} type="number" step="0.01" value={toStr(pricing.base)} onChange={(e) => setBase(e.target.value)} />
        </label>
        <label style={{ width: 90 }}>
          <span style={label}>Ganancia %</span>
          <input style={input} type="number" step="0.1" value={round2(result.gainPct)} onChange={(e) => setGain(e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          <span style={label}>Final ({cur})</span>
          <input style={input} type="number" step="0.01" value={toStr(result.listFinal)} onChange={(e) => setFinal(e.target.value)} />
        </label>
      </div>

      {/* Rules */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...label, marginTop: 2 }}>Reglas</span>
        <RuleBuilder rules={pricing.rules} onChange={setRules} />
      </div>

      {/* Preview of the after-rules final (self-contained rules only; buyer-based
          rules apply at checkout when a buyer is known). */}
      {rulesChangeFinal && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          Con reglas (hoy): <strong style={{ color: 'var(--fg)' }}>{toStr(result.final)} {cur}</strong>
          {result.appliedRuleIds.length ? ` · ${result.appliedRuleIds.length} regla(s) aplicada(s)` : ''}
        </div>
      )}
    </div>
  )
}

function driverLabel(d: YPricing['driver']): string {
  switch (d) {
    case 'base+gain': return 'base × ganancia → final'
    case 'base+final': return 'base + final → ganancia'
    case 'gain+final': return 'ganancia + final → base'
  }
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
