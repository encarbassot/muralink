# @muralink/editor

The shared markdown editing surface, built on CodeMirror 6. One editor, used by
every module that edits text — notes, murales, and anything added later.

It exists because there were two of them. The notes module and the murales
module each grew their own editor, which meant every fix landed twice and the
two drifted apart in keybindings and decorations. Extracting the surface removed
the duplication *and* the dependency edge that had murales reaching into notes'
internals.

## What lives here

- **[src/MarkdownEditor.tsx](src/MarkdownEditor.tsx)** — the component. A single
  editing surface: markdown in, markdown out.
- **[src/Toolbar.tsx](src/Toolbar.tsx)** — the toolbar plus the command helpers
  (`wrapSelection`, `prefixLines`) for callers that drive the `EditorView`
  themselves.
- **[src/engine/](src/engine/)** — state construction, decorations, keymaps and
  theme. The CodeMirror-shaped half.

## Rules

- **All `@codemirror/*` internals stay in this package.** Consumers import from
  `@muralink/editor` and nothing else — that boundary is what allows the engine
  to be replaced without touching a single module.
- **No module-specific behaviour.** If notes needs something murales must not
  have, it belongs in notes, expressed through props.
