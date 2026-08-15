import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/**
 * CM6 editor chrome theme. Bound to the shell's CSS-variable token system
 * (--fg, --accent, --border, --bg-elevated) so the editor renders identically
 * inside both the web and electron shells. Decoration styling lives in editor.css.
 */
export const appTheme: Extension = EditorView.theme(
  {
    '&': {
      height: '100%',
      background: 'transparent',
      color: 'var(--fg)',
    },

    '.cm-scroller': {
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontSize: '14px',
      lineHeight: '1.75',
      overflow: 'auto',
    },

    '.cm-content': {
      padding: '12px 16px',
      caretColor: 'var(--accent)',
    },

    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },

    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },

    '.cm-selectionBackground': {
      background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
    },

    '&.cm-focused .cm-selectionBackground, ::selection': {
      background: 'color-mix(in srgb, var(--accent) 24%, transparent)',
    },

    '.cm-activeLine': {
      background: 'color-mix(in srgb, var(--fg) 4%, transparent)',
      borderRadius: '2px',
    },

    '.cm-gutters': {
      display: 'none',
    },

    /* Tooltip / autocomplete dropdown */
    '.cm-tooltip': {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      color: 'var(--fg)',
      fontSize: '13px',
    },

    '.cm-tooltip-autocomplete > ul > li': {
      padding: '4px 10px',
    },

    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
      color: 'var(--fg)',
    },
  },
  { dark: true },
)
