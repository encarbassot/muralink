# @muralink/module-calcsheet

A spreadsheet you can program. Formula cells like any sheet, plus reusable
sandboxed functions, global variables and block rules — the layer that turns a
grid of numbers into a pricing model.

The maths lives in [`@muralink/calc`](../../packages/calc), not here. This module
is the data contract, the storage and the views; the engine is a package because
a deterministic evaluator has no business being coupled to a widget.

## What lives here

- **[manifest.ts](manifest.ts)** — declares `YCalcSheet`. A leaf module: no
  module dependencies, because the engine is a package rather than a module.
- **[implementations/web/](implementations/web/)** — the sheet UI, formula bar
  and the cell surface.
- **[implementations/server/](implementations/server/)** — persistence.

## Rules

- **Determinism is inherited from the engine.** No clock, no randomness, no
  locale-dependent parsing in a formula: a sheet must recompute identically on
  every device or sync turns into a conflict machine.
- **User-defined functions run in the QuickJS sandbox**, never on the host.
