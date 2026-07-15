import { useState, useCallback, useEffect } from 'react'
import type { AppDescriptor, NavNode, AppContentProvider, GridItem } from '@/types/navigation'

const BUTTONS = [
  ['C', '±', '⌫', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
]

const OP_MAP: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' }
const OPS = new Set(['÷', '×', '−', '+'])

function Calculator() {
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState<string | null>(null)
  const [op, setOp] = useState<string | null>(null)
  const [fresh, setFresh] = useState(false) // next digit clears display

  const compute = useCallback((a: string, operator: string, b: string) => {
    const fa = parseFloat(a)
    const fb = parseFloat(b)
    const jsOp = OP_MAP[operator]
    if (jsOp === '/' && fb === 0) return 'Error'
    const result = jsOp === '/' ? fa / fb
      : jsOp === '*' ? fa * fb
      : jsOp === '-' ? fa - fb
      : fa + fb
    const str = String(parseFloat(result.toPrecision(12)))
    return str
  }, [])

  const press = useCallback((key: string) => {
    if (key === 'C') {
      setDisplay('0'); setPrev(null); setOp(null); setFresh(false)
      return
    }
    if (key === '⌫') {
      setDisplay((d) => d.length > 1 ? d.slice(0, -1) : '0')
      return
    }
    if (key === '±') {
      setDisplay((d) => d.startsWith('-') ? d.slice(1) : d === '0' ? '0' : '-' + d)
      return
    }
    if (key === '%') {
      setDisplay((d) => String(parseFloat(d) / 100))
      return
    }
    if (OPS.has(key)) {
      if (op && prev && !fresh) {
        const result = compute(prev, op, display)
        setPrev(result); setDisplay(result)
      } else {
        setPrev(display)
      }
      setOp(key); setFresh(true)
      return
    }
    if (key === '=') {
      if (!op || !prev) return
      const result = compute(prev, op, display)
      setDisplay(result); setPrev(null); setOp(null); setFresh(false)
      return
    }
    if (key === '.') {
      setDisplay((d) => {
        const next = fresh ? '0.' : d
        setFresh(false)
        return next.includes('.') ? next : next + '.'
      })
      if (fresh) setFresh(false)
      return
    }
    // digit
    setDisplay((d) => {
      if (fresh) { setFresh(false); return key }
      return d === '0' ? key : d + key
    })
    if (fresh) setFresh(false)
  }, [op, prev, display, compute, fresh])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        '/': '÷', '*': '×', '-': '−', '+': '+', Enter: '=',
        Backspace: '⌫', Escape: 'C', '%': '%',
      }
      const key = map[e.key] ?? (e.key.match(/^[0-9.]$/) ? e.key : null)
      if (key) { e.preventDefault(); press(key) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [press])

  const isOp = (k: string) => OPS.has(k) || k === '='
  const isTop = (k: string) => ['C', '±', '⌫'].includes(k)

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: 'var(--bg-panel)' }}>
      <div
        style={{
          width: 280,
          borderRadius: 'var(--bento-radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow)',
        }}
      >
        {/* Display */}
        <div
          style={{
            padding: '20px 16px 12px',
            textAlign: 'right',
            minHeight: 80,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <div style={{ color: 'var(--fg-faint)', fontSize: 12, minHeight: 16 }}>
            {prev && op ? `${prev} ${op}` : ''}
          </div>
          <div
            style={{
              color: 'var(--fg)',
              fontSize: display.length > 10 ? 22 : display.length > 7 ? 28 : 36,
              fontWeight: 300,
              letterSpacing: -1,
              fontVariantNumeric: 'tabular-nums',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {display}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)' }}>
          {BUTTONS.map((row, ri) =>
            row.map((key, ci) => {
              const isAccent = isOp(key)
              const isDim = isTop(key)
              return (
                <button
                  key={`${ri}-${ci}`}
                  onClick={() => press(key)}
                  style={{
                    height: 64,
                    background: isAccent ? 'var(--accent-dim)' : isDim ? 'var(--bg-elevated)' : 'var(--bg-panel)',
                    color: isAccent ? 'var(--accent)' : 'var(--fg)',
                    border: 'none',
                    fontSize: 20,
                    fontWeight: 400,
                    cursor: 'pointer',
                    transition: 'filter 0.1s',
                    gridColumn: key === '0' ? 'span 2' : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
                >
                  {key}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// Stub provider — never used since component takes over
class NullProvider implements AppContentProvider {
  async getChildren(): Promise<GridItem[]> { return [] }
  resolveNode(): null { return null }
}

const stubRoot: NavNode = { id: 'calculator', label: 'Calculator', icon: '🧮', appId: 'calculator', parentId: null }

export const CalculatorApp: AppDescriptor = {
  id: 'calculator',
  name: 'Calculator',
  icon: '🧮',
  get rootNode() { return stubRoot },
  createProvider: () => new NullProvider(),
  component: Calculator,
}
