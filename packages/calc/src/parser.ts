// Recursive-descent parser: tokens → Expr. Excel operator precedence, lowest to
// highest: comparison < add/sub < mul/div < power(right-assoc) < unary < primary.
// Identifier disambiguation happens here: `IF(` is a call, `A1` is a ref, `A1:B2`
// a range, `TRUE`/`FALSE` booleans, anything else a global variable.

import type { Expr, BinaryOp } from './ast.js'
import { tokenize, CalcParseError, type Token } from './lexer.js'
import { parseRef, normalizeRef } from './refs.js'

/** Parse a formula body (WITHOUT a leading '='). Literals like `42` or `hello`
 *  are handled by the engine before this is called; here everything is an
 *  expression. Throws CalcParseError on malformed input. */
export function parse(input: string): Expr {
  const tokens = tokenize(input)
  const p = new Parser(tokens)
  const expr = p.parseExpr()
  p.expectEnd()
  return expr
}

class Parser {
  private i = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.i]
  }
  private next(): Token | undefined {
    return this.tokens[this.i++]
  }
  private atOp(...ops: string[]): boolean {
    const t = this.peek()
    return t?.type === 'op' && ops.includes(t.value)
  }

  expectEnd(): void {
    if (this.i < this.tokens.length) {
      const t = this.tokens[this.i]!
      throw new CalcParseError(`Unexpected token "${t.value}"`, t.pos)
    }
  }

  // comparison (lowest precedence)
  parseExpr(): Expr {
    let left = this.parseAdd()
    while (this.atOp('=', '<>', '<', '<=', '>', '>=')) {
      const op = this.next()!.value as BinaryOp
      left = { t: 'binary', op, l: left, r: this.parseAdd() }
    }
    return left
  }

  private parseAdd(): Expr {
    let left = this.parseMul()
    while (this.atOp('+', '-')) {
      const op = this.next()!.value as BinaryOp
      left = { t: 'binary', op, l: left, r: this.parseMul() }
    }
    return left
  }

  private parseMul(): Expr {
    let left = this.parsePow()
    while (this.atOp('*', '/')) {
      const op = this.next()!.value as BinaryOp
      left = { t: 'binary', op, l: left, r: this.parsePow() }
    }
    return left
  }

  // power is right-associative: 2^3^2 = 2^(3^2)
  private parsePow(): Expr {
    const left = this.parseUnary()
    if (this.atOp('^')) {
      this.next()
      return { t: 'binary', op: '^', l: left, r: this.parsePow() }
    }
    return left
  }

  private parseUnary(): Expr {
    if (this.atOp('-', '+')) {
      const op = this.next()!.value as '-' | '+'
      return { t: 'unary', op, x: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const t = this.peek()
    if (!t) throw new CalcParseError('Unexpected end of formula', -1)

    if (t.type === 'num') {
      this.next()
      return { t: 'num', v: Number(t.value) }
    }
    if (t.type === 'str') {
      this.next()
      return { t: 'str', v: t.value }
    }
    if (t.type === 'lparen') {
      this.next()
      const inner = this.parseExpr()
      const close = this.next()
      if (close?.type !== 'rparen') throw new CalcParseError('Expected ")"', close?.pos ?? -1)
      return inner
    }
    if (t.type === 'ident') {
      return this.parseIdent()
    }
    throw new CalcParseError(`Unexpected token "${t.value}"`, t.pos)
  }

  private parseIdent(): Expr {
    const ident = this.next()!
    const name = ident.value

    // Function call: IDENT '(' args ')'
    if (this.peek()?.type === 'lparen') {
      this.next() // consume '('
      const args: Expr[] = []
      if (this.peek()?.type !== 'rparen') {
        args.push(this.parseExpr())
        while (this.peek()?.type === 'comma') {
          this.next()
          args.push(this.parseExpr())
        }
      }
      const close = this.next()
      if (close?.type !== 'rparen') throw new CalcParseError('Expected ")"', close?.pos ?? -1)
      return { t: 'call', name: name.toUpperCase(), args }
    }

    // Boolean literals.
    const upper = name.toUpperCase()
    if (upper === 'TRUE') return { t: 'bool', v: true }
    if (upper === 'FALSE') return { t: 'bool', v: false }

    // Cell ref (optionally a range A1:B2).
    if (parseRef(name)) {
      if (this.peek()?.type === 'colon') {
        this.next()
        const toTok = this.next()
        if (toTok?.type !== 'ident' || !parseRef(toTok.value)) {
          throw new CalcParseError('Expected a cell ref after ":"', toTok?.pos ?? -1)
        }
        return { t: 'range', from: normalizeRef(name), to: normalizeRef(toTok.value) }
      }
      return { t: 'ref', ref: normalizeRef(name) }
    }

    // Otherwise a global variable.
    return { t: 'global', name }
  }
}
