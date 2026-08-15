# @muralink/calc

A deterministic spreadsheet engine: lexer, parser, dependency graph, evaluator.
Same input, same output, on a browser or on a server — no ambient state, no
clock, no locale surprises. It is the engine behind the calcsheet module and,
later, any generic table.

## What lives here

- **[src/lexer.ts](src/lexer.ts) · [src/ast.ts](src/ast.ts)** — formula text to
  tokens to syntax tree.
- **[src/graph.ts](src/graph.ts)** — the dependency graph between cells. Cycles
  are detected here, not discovered by a stack overflow at evaluation time.
- **[src/evaluate.ts](src/evaluate.ts) · [src/functions.ts](src/functions.ts)** —
  evaluation and the built-in function library.
- **[src/blocks/](src/blocks/)** — higher-level rule blocks, exported as
  `@muralink/calc/blocks`.
- **sandbox** (`@muralink/calc/sandbox`) — user-defined functions executed in a
  QuickJS WASM sandbox. Kept in a subpath on purpose: importing the core engine
  must never drag a WASM runtime into a bundle that has no user functions.

## Rules

- **The core is zero-dependency.** `quickjs-emscripten` is only reachable
  through the `sandbox` subpath.
- **Determinism is the contract.** No `Date.now()`, no `Math.random()`, no
  locale-dependent parsing inside evaluation. A sheet must recompute to the same
  values on any machine, or sync between devices becomes a conflict generator.
- **User code never runs on the host.** Custom functions get the sandbox, always
  — the engine treats them as untrusted input, because they are.
