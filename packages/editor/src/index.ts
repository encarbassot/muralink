// Public surface of @muralink/editor — the shared markdown editor primitive.
// Consumers import only from here; all @codemirror/* internals stay in this package.
export { MarkdownEditor } from './MarkdownEditor.tsx'
export type { MarkdownEditorProps } from './MarkdownEditor.tsx'
// Command helpers for callers that drive the live EditorView themselves.
export { Toolbar, wrapSelection, prefixLines } from './Toolbar.tsx'
export type { ToolbarProps } from './Toolbar.tsx'
