// Tokenizer: formula string → tokens. Deterministic, locale-free number parsing
// (decimal point only). Whitespace is insignificant. Throws a CalcParseError on
// an unrecognized character so the engine can surface a #VALUE without crashing.

export type TokenType =
  | 'num'
  | 'str'
  | 'ident' // cell ref, function name, or global — disambiguated by the parser
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'

export interface Token {
  type: TokenType
  value: string
  pos: number
}

export class CalcParseError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(message)
    this.name = 'CalcParseError'
  }
}

const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '=', '<', '>']

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const ch = input[i]!

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // String literal — double-quoted, "" escapes a quote.
    if (ch === '"') {
      let j = i + 1
      let str = ''
      while (j < n) {
        if (input[j] === '"') {
          if (input[j + 1] === '"') {
            str += '"'
            j += 2
            continue
          }
          break
        }
        str += input[j]
        j++
      }
      if (j >= n) throw new CalcParseError('Unterminated string', i)
      tokens.push({ type: 'str', value: str, pos: i })
      i = j + 1
      continue
    }

    // Number — digits with optional fraction and exponent.
    if ((ch >= '0' && ch <= '9') || (ch === '.' && isDigit(input[i + 1]))) {
      let j = i
      while (j < n && /[0-9.eE+-]/.test(input[j]!)) {
        // Only consume +/- when part of an exponent.
        if ((input[j] === '+' || input[j] === '-') && !(input[j - 1] === 'e' || input[j - 1] === 'E')) break
        j++
      }
      const raw = input.slice(i, j)
      if (!/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw)) {
        throw new CalcParseError(`Malformed number "${raw}"`, i)
      }
      tokens.push({ type: 'num', value: raw, pos: i })
      i = j
      continue
    }

    // Identifier — letters then letters/digits. Cell refs (A1) are identifiers too.
    if (isAlpha(ch)) {
      let j = i
      while (j < n && isAlphaNum(input[j]!)) j++
      tokens.push({ type: 'ident', value: input.slice(i, j), pos: i })
      i = j
      continue
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, pos: i }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, pos: i }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch, pos: i }); i++; continue }
    if (ch === ':') { tokens.push({ type: 'colon', value: ch, pos: i }); i++; continue }

    // Multi-char then single-char operators.
    const op = OPS.find((o) => input.startsWith(o, i))
    if (op) { tokens.push({ type: 'op', value: op, pos: i }); i += op.length; continue }

    throw new CalcParseError(`Unexpected character "${ch}"`, i)
  }

  return tokens
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}
function isAlpha(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_'
}
function isAlphaNum(ch: string): boolean {
  return isAlpha(ch) || (ch >= '0' && ch <= '9')
}
