// @muralink/calc/blocks — the deterministic block-rule model: schema, a pure
// host interpreter (blocks-mode), and a one-way blocks→source compiler for the
// "edit source" view. Reused by the calcsheet rule builder and the stock pricing
// rules; forward-compatible with the platform's block-designer vision.

export type {
  RuleBlock,
  ValueBlock,
  CheckBlock,
  ActionBlock,
  BlockInstanceRef,
} from './schema.js'
export {
  type RuleContext,
  type RuleResult,
  evalRule,
} from './context.js'
export { compileBlocksToSource, describeRule } from './compile.js'
