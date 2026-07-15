// @ts-nocheck — vendored from the mural.ink playground. Kept verbatim; its types
// are looser than this repo's strict config. Behavior validated at runtime.
import {
  EditorState,
  EditorSelection,
  type Extension,
} from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  placeholder as cmPlaceholder,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  selectNextOccurrence,
} from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { decoConfigCompartment, makeDecoExtension, type DecoConfig, DEFAULT_DECO_CONFIG } from './decorations'
import { markdownKeymap } from './keymaps'
import { appTheme } from './theme'

export interface EditorStateOptions {
  doc: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  decoConfig?: DecoConfig
}

export function createEditorState(options: EditorStateOptions): EditorState {
  const { doc, onChange, placeholder: placeholderText, readOnly = false, decoConfig = DEFAULT_DECO_CONFIG } = options

  const extensions: Extension[] = [
    // ── History (undo/redo) ────────────────────────────────────────
    history(),

    // ── Drawing / selection ────────────────────────────────────────
    drawSelection(),
    dropCursor(),

    // ── Multiple cursors ───────────────────────────────────────────
    // Ctrl+D selects next occurrence (VS Code muscle memory)
    // Alt+Click adds a cursor
    // Ctrl+Alt+Up/Down adds cursor above/below
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),

    // ── Markdown language (provides lezer syntax tree) ─────────────
    markdown(),

    // ── In-place decorations ───────────────────────────────────────
    decoConfigCompartment.of(makeDecoExtension(decoConfig)),

    // ── Keymaps ────────────────────────────────────────────────────
    // Order matters: markdownKeymap overrides before defaultKeymap
    keymap.of([
      // Ctrl+D — select next occurrence
      { key: 'Mod-d', run: selectNextOccurrence },
      // All custom markdown shortcuts
      ...markdownKeymap,
      // Tab with indentation support
      indentWithTab,
      // History shortcuts (Ctrl+Z, Ctrl+Shift+Z)
      ...historyKeymap,
      // CM6 defaults (arrow keys, delete, etc.)
      ...defaultKeymap,
    ]),

    // ── Theme ──────────────────────────────────────────────────────
    appTheme,

    // ── Read-only ──────────────────────────────────────────────────
    EditorState.readOnly.of(readOnly),

    // ── Placeholder ────────────────────────────────────────────────
    ...(placeholderText ? [cmPlaceholder(placeholderText)] : []),

    // ── onChange listener ──────────────────────────────────────────
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString())
      }
    }),

    // ── Soft line wrapping ─────────────────────────────────────────
    EditorView.lineWrapping,

    // ── Bracket / pair wrapping ────────────────────────────────────
    // When the user has a non-empty selection and types an opening
    // bracket, wrap the selection instead of replacing it.
    EditorView.inputHandler.of((view, _from, _to, text) => {
      const PAIRS: Record<string, string> = { '(': ')', '{': '}', '[': ']', '<': '>' }
      const close = PAIRS[text]
      if (!close) return false

      const { state } = view
      // Only act when every selection range is non-empty
      if (state.selection.ranges.every(r => r.empty)) return false

      const newRanges = state.changeByRange(range => {
        if (range.empty) return { range }
        const selected = state.doc.sliceString(range.from, range.to)
        return {
          changes: { from: range.from, to: range.to, insert: `${text}${selected}${close}` },
          range: EditorSelection.range(range.from + 1, range.from + 1 + selected.length),
        }
      })

      view.dispatch(view.state.update(newRanges, { scrollIntoView: true, userEvent: 'input' }))
      return true
    }),
  ]

  return EditorState.create({ doc, extensions })
}
