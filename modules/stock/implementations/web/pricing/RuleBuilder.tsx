import { useState, type CSSProperties } from 'react'
import { CodeEditor } from '@muralink/ui'
import { describeRule, compileBlocksToSource, type RuleBlock } from '@muralink/calc/blocks'

// Visual builder for the deterministic pricing rules. Ships the two archetypes
// the product calls for — a list-membership discount and a time escalation — as
// draggable-block rules, each editable by its parameters and inspectable as
// source (the blocks→code view). Rules are RuleBlock JSON (the canonical form);
// this component only ever produces/edits blocks-mode rules. Reusable seed for
// the fuller calcsheet block editor later.

interface Props {
  rules: RuleBlock[]
  onChange: (rules: RuleBlock[]) => void
}

const box: CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', padding: 10,
  display: 'flex', flexDirection: 'column', gap: 8,
}
const smallInput: CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12,
  background: 'var(--bg)', color: 'var(--fg)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
const chip: CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)',
}

function id(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

function membershipRule(): RuleBlock {
  return {
    id: id(), mode: 'blocks',
    when: [{ t: 'isMember', who: { t: 'input', name: 'buyer' }, list: { t: 'listRef', ref: { type: 'list', id: '' } } }],
    then: [{ t: 'applyDiscount', pct: { t: 'literal', v: 10 } }],
  }
}

function escalationRule(): RuleBlock {
  return {
    id: id(), mode: 'blocks', when: [],
    then: [{ t: 'applyEscalation', pctPerDay: { t: 'literal', v: 5 }, untilDate: { t: 'literal', v: '' } }],
  }
}

// Narrow accessors for the two known archetypes (kept local; the general block
// editor comes with calcsheet).
function kindOf(rule: RuleBlock): 'membership' | 'escalation' | 'other' {
  if (rule.when[0]?.t === 'isMember' && rule.then[0]?.t === 'applyDiscount') return 'membership'
  if (rule.then[0]?.t === 'applyEscalation') return 'escalation'
  return 'other'
}

export function RuleBuilder({ rules, onChange }: Props) {
  const [sourceOpen, setSourceOpen] = useState<string | null>(null)

  const update = (rid: string, next: RuleBlock) => onChange(rules.map((r) => (r.id === rid ? next : r)))
  const remove = (rid: string) => onChange(rules.filter((r) => r.id !== rid))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rules.map((rule) => {
        const kind = kindOf(rule)
        return (
          <div key={rule.id} style={box}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>
                {rule.mode === 'code' ? 'Regla en código' : describeRule(rule)}
              </span>
              {rule.mode === 'code' && <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', border: '1px solid #f59e0b55', borderRadius: 4, padding: '1px 5px' }}>CÓDIGO</span>}
              <button onClick={() => setSourceOpen(sourceOpen === rule.id ? null : rule.id)} title="Editar código"
                style={{ border: '1px solid var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '2px 7px' }}>{'</>'}</button>
              <button onClick={() => remove(rule.id)} title="Eliminar regla"
                style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>

            {rule.mode !== 'code' && kind === 'membership' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 2 }}>
                  <span style={chip}>Lista (id)</span>
                  <input style={smallInput} placeholder="p. ej. vip"
                    value={listRefId(rule)}
                    onChange={(e) => update(rule.id, withListId(rule, e.target.value))} />
                </label>
                <label style={{ width: 90 }}>
                  <span style={chip}>Descuento %</span>
                  <input style={smallInput} type="number"
                    value={discountPct(rule)}
                    onChange={(e) => update(rule.id, withDiscountPct(rule, Number(e.target.value) || 0))} />
                </label>
              </div>
            )}

            {rule.mode !== 'code' && kind === 'escalation' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ width: 100 }}>
                  <span style={chip}>%/día</span>
                  <input style={smallInput} type="number"
                    value={escPct(rule)}
                    onChange={(e) => update(rule.id, withEscPct(rule, Number(e.target.value) || 0))} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={chip}>Hasta</span>
                  <input style={smallInput} type="date"
                    value={escUntil(rule)}
                    onChange={(e) => update(rule.id, withEscUntil(rule, e.target.value))} />
                </label>
              </div>
            )}

            {sourceOpen === rule.id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <CodeEditor
                  value={rule.mode === 'code' && rule.source ? rule.source : compileBlocksToSource(rule)}
                  language="javascript"
                  minHeight={90}
                  onChange={(src) => update(rule.id, { ...rule, mode: 'code', source: src })}
                />
                {rule.mode === 'code' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-faint)', flex: 1 }}>Edición manual — el código manda; los parámetros de bloques quedan desactivados.</span>
                    <button onClick={() => { const { source: _s, ...blocks } = rule; update(rule.id, { ...blocks, mode: 'blocks' }) }}
                      style={{ border: '1px solid var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>volver a bloques</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onChange([...rules, membershipRule()])}
          style={{ border: '1px dashed var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '6px 10px' }}>+ Descuento por lista</button>
        <button onClick={() => onChange([...rules, escalationRule()])}
          style={{ border: '1px dashed var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '6px 10px' }}>+ Escalado temporal</button>
      </div>
    </div>
  )
}

// ── archetype accessors (safe, typed reads/writes of the known block shapes) ──
function listRefId(r: RuleBlock): string {
  const c = r.when[0]
  return c?.t === 'isMember' && c.list.t === 'listRef' ? c.list.ref.id : ''
}
function withListId(r: RuleBlock, id: string): RuleBlock {
  return { ...r, when: [{ t: 'isMember', who: { t: 'input', name: 'buyer' }, list: { t: 'listRef', ref: { type: 'list', id } } }] }
}
function discountPct(r: RuleBlock): number {
  const a = r.then[0]
  return a?.t === 'applyDiscount' && a.pct.t === 'literal' && typeof a.pct.v === 'number' ? a.pct.v : 0
}
function withDiscountPct(r: RuleBlock, v: number): RuleBlock {
  return { ...r, then: [{ t: 'applyDiscount', pct: { t: 'literal', v } }] }
}
function escPct(r: RuleBlock): number {
  const a = r.then[0]
  return a?.t === 'applyEscalation' && a.pctPerDay.t === 'literal' && typeof a.pctPerDay.v === 'number' ? a.pctPerDay.v : 0
}
function escUntil(r: RuleBlock): string {
  const a = r.then[0]
  return a?.t === 'applyEscalation' && a.untilDate.t === 'literal' && typeof a.untilDate.v === 'string' ? a.untilDate.v : ''
}
function withEscPct(r: RuleBlock, v: number): RuleBlock {
  const until = escUntil(r)
  return { ...r, then: [{ t: 'applyEscalation', pctPerDay: { t: 'literal', v }, untilDate: { t: 'literal', v: until } }] }
}
function withEscUntil(r: RuleBlock, until: string): RuleBlock {
  const v = escPct(r)
  return { ...r, then: [{ t: 'applyEscalation', pctPerDay: { t: 'literal', v }, untilDate: { t: 'literal', v: until } }] }
}
