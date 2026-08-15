# @muralink/module-text

The plain note: a small editable surface that holds text and nothing else. The
widget you drop on a dashboard when you just need somewhere to write.

For markdown with a real editing surface, that is
[`@muralink/module-notes`](../notes) on top of
[`@muralink/editor`](../../packages/editor). This module stays deliberately
smaller.

## What lives here

- **[manifest.ts](manifest.ts)** — a leaf module, no shared types.
- **[implementations/web/](implementations/web/)** — the in-place editable view.

## Rules

- **Edits in place.** No modal, no separate edit mode: the widget *is* the
  editor.
- **Keep it small.** Every feature this grows is a feature notes already has.
