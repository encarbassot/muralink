<!--
One concern per PR. The "why" is the part reviewers cannot reconstruct from
the diff — spend your words there.
-->

## What this changes

## Why

## How it was verified

<!-- What you actually ran, and what it printed. "Should work" is not verification. -->

## Checklist

- [ ] Works offline, or degrades cleanly without a network
- [ ] No multi-account / multi-tenant logic added to the core
- [ ] No new circular dependency between modules
- [ ] Platform capability declared in `ModuleManifest.platforms`, not detected at runtime
- [ ] If it adds a widget: registered in `packages/app/src/registry.tsx` **and** added to `registerAll()`
- [ ] Existing `ELIO_*` / `elio-*` identifiers left alone (renaming them breaks live deployments)
