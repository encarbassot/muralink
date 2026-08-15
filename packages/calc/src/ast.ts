// The expression tree a formula parses into. Pure data — no evaluation logic
// here. The evaluator (evaluate.ts) walks it; the dependency graph (graph.ts)
// statically extracts cell/global refs from it WITHOUT evaluating, so recompute
// order can be computed before any value exists.

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '=' | '<>' | '<' | '<=' | '>' | '>='
export type UnaryOp = '-' | '+' | 'not'

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; ref: string } // 'A1' — a single cell
  | { t: 'range'; from: string; to: string } // 'A1:B3'
  | { t: 'global'; name: string } // a right-panel global variable
  | { t: 'unary'; op: UnaryOp; x: Expr }
  | { t: 'binary'; op: BinaryOp; l: Expr; r: Expr }
  | { t: 'call'; name: string; args: Expr[] } // builtin OR user-defined function

/** Statically collect every cell ref an expression depends on (single refs plus
 *  every cell inside a range). Used to build the recompute graph — never
 *  evaluates. Globals/function calls contribute their own deps via the engine. */
export function collectRefs(expr: Expr, out: Set<string>, expandRange: (from: string, to: string) => string[]): void {
  switch (expr.t) {
    case 'ref':
      out.add(expr.ref)
      return
    case 'range':
      for (const id of expandRange(expr.from, expr.to)) out.add(id)
      return
    case 'unary':
      collectRefs(expr.x, out, expandRange)
      return
    case 'binary':
      collectRefs(expr.l, out, expandRange)
      collectRefs(expr.r, out, expandRange)
      return
    case 'call':
      for (const a of expr.args) collectRefs(a, out, expandRange)
      return
    default:
      // num | str | bool | global — no cell deps
      return
  }
}
