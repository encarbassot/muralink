// @muralink/calc — deterministic spreadsheet/formula engine. Pure, synchronous,
// zero-dependency: the same definitions yield the same values on web and server.
// The sandbox for user-defined JS functions ships in a separate subpath so this
// core stays dependency-free.

export {
  type CellValue,
  type CalcError,
  type CalcErrorCode,
  err,
  isError,
  isBlank,
  toNumber,
  toBoolean,
  toText,
} from './values.js'
export type { Expr, BinaryOp, UnaryOp } from './ast.js'
export { collectRefs } from './ast.js'
export { parse } from './parser.js'
export { tokenize, CalcParseError } from './lexer.js'
export type { Token, TokenType } from './lexer.js'
export { parseRef, formatRef, normalizeRef, expandRange, type Coord } from './refs.js'
export { evaluate, type EvalScope } from './evaluate.js'
export {
  type BuiltinFn,
  type FnRegistry,
  BUILTINS,
  SPECIAL_FORMS,
  defaultRegistry,
} from './functions.js'
export { topoOrder, CalcCycleError, type TopoResult } from './graph.js'
export {
  CalcEngine,
  parseSource,
  type CellDef,
  type GlobalVar,
  type EngineConfig,
  type UserFnCaller,
} from './engine.js'
