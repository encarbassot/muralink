// @ts-nocheck — vendored from the mural.ink playground. Kept verbatim; its types
// are looser than this repo's strict config. Behavior validated at runtime.
import {
  type KeyBinding,
  EditorView,
} from '@codemirror/view'
import {
  indentMore,
  indentLess,
} from '@codemirror/commands'
import {
  type EditorState,
  type ChangeSpec,
  EditorSelection,
} from '@codemirror/state'

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Word boundary characters (anything that is not a word char). */
const WORD_BOUNDARY = /\W/

function wordAt(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos)
  let from = pos
  let to = pos
  while (from > line.from && !WORD_BOUNDARY.test(state.doc.sliceString(from - 1, from))) from--
  while (to < line.to && !WORD_BOUNDARY.test(state.doc.sliceString(to, to + 1))) to++
  return { from, to }
}

/**
 * Toggle a wrapper (e.g. `**`) around the selection or word under cursor.
 * If already wrapped → removes the wrapper. Otherwise adds it.
 */
function toggleWrap(view: EditorView, wrapper: string): boolean {
  const { state } = view
  const changes: ChangeSpec[] = []

  for (const range of state.selection.ranges) {
    let { from, to } = range
    if (from === to) {
      // No selection — expand to word boundary
      const word = wordAt(state, from)
      from = word.from
      to = word.to
    }

    const selected = state.doc.sliceString(from, to)
    const w = wrapper

    if (selected.startsWith(w) && selected.endsWith(w) && selected.length >= w.length * 2) {
      // Unwrap
      changes.push({ from, to, insert: selected.slice(w.length, selected.length - w.length) })
    } else {
      // Wrap
      changes.push({ from, to, insert: `${w}${selected}${w}` })
    }
  }

  if (changes.length === 0) return false

  view.dispatch(state.update({ changes, scrollIntoView: true }))
  return true
}

/**
 * Get the text of the line at the primary cursor.
 */
function currentLine(state: EditorState): string {
  return state.doc.lineAt(state.selection.main.head).text
}

// ─── List / heading context helpers ───────────────────────────────────────

const RE_UNORDERED = /^(\s*)([-*+])\s/
const RE_CHECKBOX  = /^(\s*)([-*+])\s+\[[ xX]\]\s*/
const RE_ORDERED = /^(\s*)(\d+)\.\s/
const RE_HEADING = /^#{1,6} /

function isInList(state: EditorState): boolean {
  const line = currentLine(state)
  return RE_UNORDERED.test(line) || RE_ORDERED.test(line)
}

function isInHeading(state: EditorState): boolean {
  return RE_HEADING.test(currentLine(state))
}

// ─── keymap entries ───────────────────────────────────────────────────────

/**
 * Mod+Enter — insert a newline at the END of the current line and move
 * the cursor there (regardless of where on the line the cursor sits).
 */
function newlineAtEnd(view: EditorView): boolean {
  const { state } = view
  const changes: ChangeSpec[] = []
  const newSelections: Array<{ anchor: number }> = []
  let offset = 0

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head)
    const insertPos = line.to + offset
    changes.push({ from: line.to, insert: '\n' })
    newSelections.push({ anchor: insertPos + 1 })
    offset += 1
  }

  view.dispatch(
    state.update({
      changes,
      selection: { anchor: newSelections[newSelections.length - 1].anchor },
      scrollIntoView: true,
    }),
  )
  return true
}

/**
 * Mod+K — insert [](url) and place the cursor on the link text position.
 */
function insertLink(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  const selectedText = state.doc.sliceString(range.from, range.to)
  const insert = `[${selectedText}](url)`
  const cursorPos = range.from + 1 // inside []

  view.dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: cursorPos, head: cursorPos + selectedText.length },
      scrollIntoView: true,
    }),
  )
  return true
}

/**
 * Enter while in a heading line — produce a plain newline (no continuation).
 * Returns false to let CM6 handle it normally (which is already a plain newline).
 * We need to intercept here to _prevent_ any smart-continuation logic.
 */
function enterInHeading(view: EditorView): boolean {
  if (!isInHeading(view.state)) return false
  // Insert a plain newline — CM6 default would do the same but
  // some extensions add smart continuation, so we explicitly insert here.
  view.dispatch(
    view.state.update({
      changes: { from: view.state.selection.main.head, insert: '\n' },
      selection: { anchor: view.state.selection.main.head + 1 },
      scrollIntoView: true,
    }),
  )
  return true
}

/**
 * Enter in a list item:
 * - Blank list item → break out of list (remove the marker)
 * - Non-blank → continue list with same marker
 */
function enterInList(view: EditorView): boolean {
  if (!isInList(view.state)) return false

  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const text = line.text

  const unorderedMatch = RE_UNORDERED.exec(text)
  const orderedMatch = RE_ORDERED.exec(text)

  // Blank list item → remove marker and break out
  const marker = unorderedMatch ? unorderedMatch[0] : orderedMatch ? orderedMatch[0] : null
  if (marker && text === marker.trimEnd()) {
    // Replace the entire line with an empty line
    view.dispatch(
      state.update({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        scrollIntoView: true,
      }),
    )
    return true
  }

  // Checkbox list item: continue with unchecked marker
  const checkboxMatch = RE_CHECKBOX.exec(text)
  if (checkboxMatch) {
    const indent = checkboxMatch[1]
    const bullet = checkboxMatch[2]
    // Blank checkbox item (nothing after `- [ ] `) → break out of list
    if (text.trim() === `${bullet} [ ]` || text.trim() === `${bullet} [x]` || text.trim() === `${bullet} [X]`) {
      view.dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      )
      return true
    }
    const continuation = `\n${indent}${bullet} [ ] `
    view.dispatch(
      state.update({
        changes: { from: state.selection.main.head, insert: continuation },
        selection: { anchor: state.selection.main.head + continuation.length },
        scrollIntoView: true,
      }),
    )
    return true
  }

  // Continue list
  if (unorderedMatch) {
    const indent = unorderedMatch[1]
    const bullet = unorderedMatch[2]
    const continuation = `\n${indent}${bullet} `
    view.dispatch(
      state.update({
        changes: { from: state.selection.main.head, insert: continuation },
        selection: { anchor: state.selection.main.head + continuation.length },
        scrollIntoView: true,
      }),
    )
    return true
  }

  if (orderedMatch) {
    const indent = orderedMatch[1]
    const num = parseInt(orderedMatch[2], 10)
    const continuation = `\n${indent}${num + 1}. `
    view.dispatch(
      state.update({
        changes: { from: state.selection.main.head, insert: continuation },
        selection: { anchor: state.selection.main.head + continuation.length },
        scrollIntoView: true,
      }),
    )
    return true
  }

  return false
}

/**
 * Tab — indent list items (delegate to CM6's indentMore if in a list, else
 * insert two spaces to avoid focus trap).
 */
function tabInList(view: EditorView): boolean {
  if (!isInList(view.state)) {
    // Outside a list: insert two spaces (avoids focus trap)
    view.dispatch(
      view.state.update({
        changes: { from: view.state.selection.main.head, insert: '  ' },
        selection: { anchor: view.state.selection.main.head + 2 },
      }),
    )
    return true
  }
  return indentMore(view)
}

/**
 * Shift+Tab — dedent list items.
 */
function shiftTabInList(view: EditorView): boolean {
  if (!isInList(view.state)) return false
  return indentLess(view)
}

// ─── Input rules (triggered while typing) ────────────────────────────────
//
// The decorations in decorations.ts handle the visual transformation;
// syntax delimiters stay in the document as plain text and decorations
// provide the visual styling. No text rewriting is needed.


export const markdownKeymap: KeyBinding[] = [
  { key: 'Mod-Enter', run: newlineAtEnd },
  { key: 'Mod-b', run: (view: EditorView) => toggleWrap(view, '**') },
  { key: 'Mod-i', run: (view: EditorView) => toggleWrap(view, '*') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-e', run: (view: EditorView) => toggleWrap(view, '`') },
  { key: 'Mod-d', run: selectNextOccurrence },
  { key: 'Tab', run: tabInList },
  { key: 'Shift-Tab', run: shiftTabInList },
  { key: 'Enter', run: enterInHeading },
  { key: 'Enter', run: enterInList },
]

/**
 * Cmd/Ctrl+D — select next occurrence of the current selection or word.
 * Adds a new selection range for the next match (wraps to start).
 */
function selectNextOccurrence(view: EditorView): boolean {
  const { state } = view

  // Determine the seed text from the primary selection, or expand to word
  let { from, to } = state.selection.main
  if (from === to) {
    const w = wordAt(state, from)
    from = w.from
    to = w.to
  }

  const seed = state.doc.sliceString(from, to)
  if (!seed) return false

  const doc = state.doc.toString()
  const len = seed.length

  // Compute search start: after the furthest selected range end
  let searchFrom = 0
  for (const r of state.selection.ranges) {
    if (r.to > searchFrom) searchFrom = r.to
  }

  // Find next occurrence not already selected
  let idx = doc.indexOf(seed, searchFrom)
  if (idx === -1) idx = doc.indexOf(seed, 0) // wrap
  if (idx === -1) return false

  // Skip occurrences already present in selection
  const already = (pos: number) => state.selection.ranges.some(r => r.from === pos && r.to === pos + len)
  let attempts = 0
  while (already(idx) && attempts < 2) {
    idx = doc.indexOf(seed, idx + 1)
    if (idx === -1) idx = doc.indexOf(seed, 0)
    if (idx === -1) return false
    attempts++
  }

  if (already(idx)) return false

  // Build new selection array (preserve existing ranges), and make the newly
  // added range the primary selection.
  const newRanges = state.selection.ranges.map(r => ({ anchor: r.anchor, head: r.head }))
  newRanges.push({ anchor: idx, head: idx + len })

  const sel = EditorSelection.create(newRanges, newRanges.length - 1)
  view.dispatch(state.update({ selection: sel, scrollIntoView: true }))
  return true
}
