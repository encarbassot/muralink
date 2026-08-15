import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalcEngine, formatRef, toText, isError, type CellDef } from '@muralink/calc'
import { makeUserFnCaller, preloadSandbox, type UserFn } from '@muralink/calc/sandbox'
import { CodeEditor } from '@muralink/ui'
import type { YCalcSheet, GlobalVar } from '../../../types.ts'

// The spreadsheet surface: a formula grid + a formula bar + a right-side globals
// panel (VSCode/Notion style). Deterministic recompute via @muralink/calc.
// Presentational + prop-driven — the host owns persistence.

interface Props {
  sheet: YCalcSheet
  onChange: (sheet: YCalcSheet) => void
  readOnly?: boolean
}

function colLetter(col: number): string {
  return formatRef({ col, row: 0 }).replace(/\d+$/, '')
}

const cellBase: CSSProperties = {
  border: '1px solid var(--border)', minWidth: 72, height: 26, padding: '0 6px', fontSize: 12,
  color: 'var(--fg)', background: 'var(--bg-elevated)', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'cell',
}
const headBase: CSSProperties = {
  border: '1px solid var(--border)', minWidth: 72, height: 22, fontSize: 10, fontWeight: 700,
  color: 'var(--fg-faint)', background: 'var(--bg)', textAlign: 'center',
}

export function CalcSheetApp({ sheet, onChange, readOnly }: Props) {
  const [selected, setSelected] = useState<string>('A1')
  const cols = sheet.cols ?? 5
  const rows = sheet.rows ?? 10

  // Load the JS sandbox only if the sheet has user functions (pure-formula sheets
  // never pay the wasm cost). `ready` flips a re-render once it's warm.
  const [fnReady, setFnReady] = useState(false)
  const hasFns = sheet.functions.length > 0
  useEffect(() => {
    if (!hasFns) return
    let alive = true
    void preloadSandbox().then(() => { if (alive) setFnReady(true) })
    return () => { alive = false }
  }, [hasFns])

  // Rebuild the engine from the sheet on each change (cheap for editor-sized sheets).
  const values = useMemo(() => {
    const cells: CellDef[] = Object.entries(sheet.cells).map(([id, src]) => ({ id, src }))
    const callUser = hasFns ? makeUserFnCaller(sheet.functions) : undefined
    const engine = new CalcEngine({ cells, globals: sheet.globals, callUser })
    const snap = new Map<string, string>()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = formatRef({ col: c, row: r })
        const v = engine.getValue(id)
        snap.set(id, toText(v))
        if (isError(v)) snap.set(id + '#err', '1')
      }
    }
    return snap
  }, [sheet.cells, sheet.globals, sheet.functions, cols, rows, fnReady, hasFns])

  const setCell = (id: string, src: string) => {
    const cells = { ...sheet.cells }
    if (src === '') delete cells[id]
    else cells[id] = src
    onChange({ ...sheet, cells })
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Formula bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', minWidth: 28 }}>{selected}</span>
          <input
            value={sheet.cells[selected] ?? ''}
            onChange={(e) => setCell(selected, e.target.value)}
            readOnly={readOnly}
            placeholder="valor o =fórmula (p. ej. =A1*(1+B1))"
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--bg-elevated)', color: 'var(--fg)', outline: 'none' }}
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headBase, minWidth: 30 }} />
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} style={headBase}>{colLetter(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  <td style={{ ...headBase, minWidth: 30 }}>{r + 1}</td>
                  {Array.from({ length: cols }, (_, c) => {
                    const id = formatRef({ col: c, row: r })
                    const isSel = id === selected
                    const errored = values.get(id + '#err') === '1'
                    return (
                      <td
                        key={c}
                        onClick={() => setSelected(id)}
                        style={{
                          ...cellBase,
                          outline: isSel ? '2px solid var(--primary, #3b82f6)' : 'none',
                          color: errored ? '#f87171' : 'var(--fg)',
                        }}
                      >
                        {values.get(id)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FunctionsPanel functions={sheet.functions} onChange={(functions) => onChange({ ...sheet, functions })} readOnly={readOnly} />
      </div>

      <GlobalsPanel globals={sheet.globals} onChange={(globals) => onChange({ ...sheet, globals })} readOnly={readOnly} />
    </div>
  )
}

// ── Functions panel (code boxes) ────────────────────────────────────────────
// Reusable, deterministic user functions authored as JS in a code box. Called
// from any cell as `=NAME(arg, …)`; runs in the QuickJS sandbox.
function FunctionsPanel({ functions, onChange, readOnly }: { functions: UserFn[]; onChange: (f: UserFn[]) => void; readOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const fnId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fn${Date.now()}`)
  const add = () => onChange([...functions, { id: fnId(), name: 'miFuncion', inputs: ['a', 'b'], outputs: ['out'], source: '({a,b}) => ({ out: a + b })' }])
  const set = (i: number, next: UserFn) => onChange(functions.map((f, j) => (j === i ? next : f)))

  return (
    <div style={{ borderTop: '1px solid var(--border)', maxHeight: open ? 320 : 34, overflow: 'hidden', transition: 'max-height 0.15s', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Funciones ({functions.length})</span>
        <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', maxHeight: 280 }}>
          {functions.map((fn, i) => (
            <div key={fn.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={fn.name} readOnly={readOnly} onChange={(e) => set(i, { ...fn, name: e.target.value })} placeholder="nombre"
                  style={{ fontWeight: 600, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', background: 'var(--bg-elevated)', color: 'var(--fg)', outline: 'none', width: 130 }} />
                <input value={fn.inputs.join(', ')} readOnly={readOnly} onChange={(e) => set(i, { ...fn, inputs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="entradas"
                  style={miniInput} />
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>→</span>
                <input value={fn.outputs.join(', ')} readOnly={readOnly} onChange={(e) => set(i, { ...fn, outputs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="salidas"
                  style={miniInput} />
                {!readOnly && <button onClick={() => onChange(functions.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>}
              </div>
              <CodeEditor value={fn.source} language="javascript" readOnly={readOnly} minHeight={54} onChange={(source) => set(i, { ...fn, source })} />
            </div>
          ))}
          {!readOnly && (
            <button onClick={add} style={{ border: '1px dashed var(--border)', background: 'none', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '6px 10px', alignSelf: 'flex-start' }}>+ Función</button>
          )}
        </div>
      )}
    </div>
  )
}

const miniInput: CSSProperties = {
  fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px',
  background: 'var(--bg-elevated)', color: 'var(--fg-dim)', outline: 'none', width: 80,
}

// ── Global variables panel (right side) ─────────────────────────────────────
function GlobalsPanel({ globals, onChange, readOnly }: { globals: GlobalVar[]; onChange: (g: GlobalVar[]) => void; readOnly?: boolean }) {
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    onChange([...globals, { name: n, src: '0' }])
    setName('')
  }
  return (
    <div style={{ width: 200, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Variables
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {globals.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>{g.name}</span>
              {!readOnly && (
                <button onClick={() => onChange(globals.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 11 }}>✕</button>
              )}
            </div>
            <input
              value={g.src}
              readOnly={readOnly}
              onChange={(e) => onChange(globals.map((x, j) => (j === i ? { ...x, src: e.target.value } : x)))}
              style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg-dim)', outline: 'none' }}
            />
          </div>
        ))}
        {globals.length === 0 && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Sin variables</span>}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border)' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="nombre" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg)', outline: 'none', minWidth: 0 }} />
          <button onClick={add} style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '0 10px' }}>+</button>
        </div>
      )}
    </div>
  )
}
