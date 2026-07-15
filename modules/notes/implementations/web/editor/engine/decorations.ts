// @ts-nocheck — vendored from the mural.ink playground. Kept verbatim; its types
// are looser than this repo's strict config. Behavior validated at runtime.
/**
 * decorations.ts
 *
 * In-place markdown decoration engine for CodeMirror 6.
 *
 * HOW IT WORKS
 * ────────────
 * A CM6 ViewPlugin walks the lezer syntax tree on every document / viewport /
 * selection change. For each markdown node it emits Mark decorations that wrap
 * ranges in semantic HTML elements and CSS classes.
 *
 * CHANGING HOW THINGS LOOK
 * ─────────────────────────
 * Open  src/editor/editor.css — that is the only file you need to touch.
 * Class naming:
 *   .mde-{token}         content decoration  (bold text, heading text…)
 *   .mde-syn             any syntax marker   (**, ##, >, backtick…)
 *   .mde-syn-{token}     extra marker style  (e.g. size for heading ##)
 *   .mde-syn-reveal      cursor-inside state (overrides hidden/muted mode)
 *
 * SYNTAX VISIBILITY
 * ─────────────────
 * The editor container carries  data-syn="hidden|muted|visible".
 * CSS rules in editor.css react to that attribute — no Compartment rebuild
 * needed when the mode changes, just a DOM attribute update.
 * When the cursor enters a range, the marker gets  .mde-syn-reveal  so CSS
 * can always show it regardless of mode.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  type Extension,
  Compartment,
  RangeSetBuilder,
  EditorSelection,
} from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNodeRef } from '@lezer/common'

// ─── Public config ────────────────────────────────────────────────────────

export interface DecoConfig {
  /** When true: show formatted content with syntax markers (e.g. <h1><span># </span>Title</h1>) */
  /** When false: show formatted content only (e.g. <h1>Title</h1>) */
  richFormatting: boolean
}

export const DEFAULT_DECO_CONFIG: DecoConfig = {
  richFormatting: true,
}

/** Exported so MarkdownEditor.tsx can hot-swap the config without remounting. */
export const decoConfigCompartment = new Compartment()

// ─── Decoration constants ─────────────────────────────────────────────────
// These are module-level constants — no allocations per keystroke.

/** Syntax marker: cursor NOT in range */
const SYN      = Decoration.mark({ class: 'mde-syn' })
/** Syntax marker: cursor IS in range — always rendered */
const SYN_REV  = Decoration.mark({ class: 'mde-syn mde-syn-reveal' })

/** Rich content decorations (wrap in semantic HTML + class) */
const RICH = {
  bold:   Decoration.mark({ tagName: 'strong', class: 'mde-bold'   }),
  italic: Decoration.mark({ tagName: 'em',     class: 'mde-italic' }),
  code:   Decoration.mark({ tagName: 'code',   class: 'mde-code'   }),
} as const

/** Flat content decorations (class only, no tagName) */
const FLAT = {
  bold:   Decoration.mark({ class: 'mde-bold'   }),
  italic: Decoration.mark({ class: 'mde-italic' }),
  code:   Decoration.mark({ class: 'mde-code'   }),
} as const

// ─── Widgets ──────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
  private readonly depth: number
  constructor(depth: number) { super(); this.depth = depth }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'mde-bullet'
    wrap.contentEditable = 'false'

    const dot = document.createElement('span')
    dot.className = 'mde-bullet-dot'
    dot.textContent = '●'
    dot.style.fontSize = `${Math.max(0.5, 0.75 - this.depth * 0.08)}em`
    wrap.appendChild(dot)

    const raw = document.createElement('span')
    raw.className = 'mde-bullet-raw'
    raw.textContent = '-'
    raw.style.fontSize = `${Math.max(0.55, 0.75 - this.depth * 0.08)}em`
    raw.style.marginRight = '3px'
    wrap.appendChild(raw)

    return wrap
  }
  eq(o: BulletWidget): boolean { return o.depth === this.depth }
}

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'mde-hr'
    return el
  }
  eq(): boolean { return true }
}

class ImageWidget extends WidgetType {
  private readonly src: string
  private readonly alt: string
  constructor(src: string, alt: string) { super(); this.src = src; this.alt = alt }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.contentEditable = 'false'
    if (this.src) {
      const img = document.createElement('img')
      img.src = this.src
      img.alt = this.alt
      img.loading = 'lazy'
      img.className = 'mde-image'
      wrap.appendChild(img)
    } else {
      const ph = document.createElement('span')
      ph.className = 'mde-image-placeholder'
      ph.textContent = '🖼'
      wrap.appendChild(ph)
    }
    // Pretty caption — hidden in rich mode and on hover (raw text is shown instead)
    if (this.alt) {
      const cap = document.createElement('span')
      cap.className = 'mde-image-caption'
      cap.textContent = this.alt
      wrap.appendChild(cap)
    }
    return wrap
  }
  eq(o: ImageWidget): boolean { return o.src === this.src && o.alt === this.alt }
}

class LinkWidget extends WidgetType {
  private readonly href: string
  private readonly label: string
  private readonly raw: string | null
  constructor(href: string, label: string, raw: string | null = null) { super(); this.href = href; this.label = label; this.raw = raw }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'mde-link-wrap'
    wrap.contentEditable = 'false'

    const a = document.createElement('a')
    a.className = 'mde-link'
    a.href = this.href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = this.label
    a.contentEditable = 'false'
    wrap.appendChild(a)

    if (this.raw) {
      const raw = document.createElement('span')
      raw.className = 'mde-link-raw'
      raw.textContent = this.raw
      wrap.appendChild(raw)
    }
    return wrap
  }
  eq(o: LinkWidget): boolean { return o.href === this.href && o.label === this.label && o.raw === this.raw }
}

class CheckboxWidget extends WidgetType {
  private readonly checked: boolean
  private readonly from: number
  private readonly to: number
  constructor(checked: boolean, from: number, to: number) {
    super(); this.checked = checked; this.from = from; this.to = to
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'mde-checkbox'
    input.contentEditable = 'false'
    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const newText = this.checked ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: this.from, to: this.to, insert: newText } })
    })
    return input
  }
  eq(o: CheckboxWidget): boolean { return o.checked === this.checked && o.from === this.from && o.to === this.to }
  ignoreEvent(): boolean { return false }
}

// ─── List "+ new" button ───────────────────────────────────────────────────
// A whole list (bullet / ordered / task) reads as ONE block element built of
// sub-items. When the cursor sits anywhere inside that block, a "+ new" button
// is rendered below the last item. Clicking it appends a fresh item that
// mirrors the last one's marker + indent, then drops the caret into it.

const RE_ADD_CHECKBOX  = /^(\s*)([-*+])\s+\[[ xX]\]/
const RE_ADD_UNORDERED = /^(\s*)([-*+])\s/
const RE_ADD_ORDERED   = /^(\s*)(\d+)\.\s/

function appendListItem(view: EditorView, lastLineTo: number): void {
  const { state } = view
  const clamped = Math.min(Math.max(0, lastLineTo), state.doc.length)
  const line = state.doc.lineAt(clamped)
  const text = line.text

  let cont: string | null = null
  const cb  = RE_ADD_CHECKBOX.exec(text)
  const uo  = RE_ADD_UNORDERED.exec(text)
  const ord = RE_ADD_ORDERED.exec(text)
  if (cb)       cont = `${cb[1]}${cb[2]} [ ] `
  else if (uo)  cont = `${uo[1]}${uo[2]} `
  else if (ord) cont = `${ord[1]}${parseInt(ord[2], 10) + 1}. `
  if (cont === null) return

  const insert = `\n${cont}`
  const at = line.to
  view.dispatch({
    changes: { from: at, insert },
    selection: EditorSelection.single(at + insert.length),
    scrollIntoView: true,
  })
  view.focus()
}

class ListAddWidget extends WidgetType {
  private readonly lastLineTo: number
  constructor(lastLineTo: number) { super(); this.lastLineTo = lastLineTo }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'mde-list-add'
    wrap.contentEditable = 'false'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mde-list-add-btn'
    btn.textContent = '+ new'
    btn.title = 'Add item'
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      appendListItem(view, this.lastLineTo)
    })
    wrap.appendChild(btn)
    return wrap
  }
  eq(o: ListAddWidget): boolean { return o.lastLineTo === this.lastLineTo }
  ignoreEvent(): boolean { return false }
}

class CodeBlockCopyWidget extends WidgetType {
  private readonly content: string
  private readonly role: 'open' | 'close'
  constructor(content: string, role: 'open' | 'close') {
    super()
    this.content = content
    this.role = role
  }
  toDOM(): HTMLElement {
    const btn = document.createElement('button')
    btn.className = `mde-codeblock-copy mde-codeblock-copy-${this.role}`
    btn.contentEditable = 'false'
    btn.setAttribute('aria-label', 'Copy code')
    btn.title = 'Copy code'
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      navigator.clipboard.writeText(this.content).then(() => {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        btn.classList.add('mde-codeblock-copy-done')
        setTimeout(() => {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
          btn.classList.remove('mde-codeblock-copy-done')
        }, 1500)
      })
    })
    // Right-click contextual menu on the copy button
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const copySvg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg>`
      const checkSvg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg>`

      openCodeBlockContextMenu(e.clientX, e.clientY, [
        { label: 'Copy block content', action: () => {
          navigator.clipboard.writeText(this.content).then(() => {
            btn.innerHTML = checkSvg
            btn.classList.add('mde-codeblock-copy-done')
            setTimeout(() => { btn.innerHTML = copySvg; btn.classList.remove('mde-codeblock-copy-done') }, 1500)
          })
        }},
        { label: 'Copy fenced block', action: () => {
          const fenced = '```\n' + this.content + '\n```'
          navigator.clipboard.writeText(fenced).then(() => {
            btn.innerHTML = checkSvg
            btn.classList.add('mde-codeblock-copy-done')
            setTimeout(() => { btn.innerHTML = copySvg; btn.classList.remove('mde-codeblock-copy-done') }, 1500)
          })
        }},
        { label: 'Cancel', action: () => {/* noop */} },
      ])
    })
    return btn
  }
  eq(o: CodeBlockCopyWidget): boolean {
    return o.content === this.content && o.role === this.role
  }
  ignoreEvent(): boolean { return false }
}
// ─── Small floating context menu for code-block actions ------------------
let __mde_currentContextMenu: HTMLElement | null = null
let __mde_docMouseHandler: ((e: MouseEvent) => void) | null = null
let __mde_docKeyHandler: ((e: KeyboardEvent) => void) | null = null

function closeCodeBlockContextMenu() {
  if (!__mde_currentContextMenu) return
  try { __mde_currentContextMenu.remove() } catch {}
  __mde_currentContextMenu = null
  if (__mde_docMouseHandler) { document.removeEventListener('mousedown', __mde_docMouseHandler); __mde_docMouseHandler = null }
  if (__mde_docKeyHandler)   { document.removeEventListener('keydown',   __mde_docKeyHandler);   __mde_docKeyHandler = null }
}

function openCodeBlockContextMenu(x: number, y: number, items: Array<{ label: string; action: () => void }>) {
  closeCodeBlockContextMenu()
  const menu = document.createElement('div')
  menu.className = 'mde-codeblock-contextmenu'
  for (const it of items) {
    const row = document.createElement('div')
    row.className = 'mde-codeblock-contextmenu-item'
    row.textContent = it.label
    row.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      try { it.action() } catch {}
      closeCodeBlockContextMenu()
    })
    menu.appendChild(row)
  }
  document.body.appendChild(menu)

  // Position and keep inside viewport
  const ww = window.innerWidth, wh = window.innerHeight
  const rect = menu.getBoundingClientRect()
  let left = x
  let top = y
  if (left + rect.width > ww) left = Math.max(8, ww - rect.width - 8)
  if (top + rect.height > wh) top = Math.max(8, wh - rect.height - 8)
  menu.style.left = left + 'px'
  menu.style.top = top + 'px'

  __mde_currentContextMenu = menu

  __mde_docMouseHandler = (ev: MouseEvent) => {
    if (!menu.contains(ev.target as Node)) closeCodeBlockContextMenu()
  }
  __mde_docKeyHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeCodeBlockContextMenu() }
  document.addEventListener('mousedown', __mde_docMouseHandler)
  document.addEventListener('keydown', __mde_docKeyHandler)
}

// ─── Cursor helpers ───────────────────────────────────────────────────────

function buildCursorSet(view: EditorView): ReadonlySet<number> {
  const s = new Set<number>()
  for (const r of view.state.selection.ranges) {
    s.add(r.head)
    if (!r.empty) s.add(r.anchor)
  }
  return s
}

function cursorInRange(cursors: ReadonlySet<number>, from: number, to: number): boolean {
  for (const p of cursors) if (p >= from && p <= to) return true
  return false
}

/** True when any ancestor node carries the given lezer node name. */
function hasAncestor(node: { parent: any }, name: string): boolean {
  let p: any = node.parent
  while (p) { if (p.name === name) return true; p = p.parent }
  return false
}

// ─── Core decoration builder ──────────────────────────────────────────────

type Range = { from: number; to: number; dec: Decoration }

function buildDecorations(view: EditorView, cfg: DecoConfig): DecorationSet {
  const { state } = view
  const cursors = buildCursorSet(view)
  const rich    = cfg.richFormatting
  const ranges: Range[] = []

  /** Add a range only if it has positive length. */
  const add = (from: number, to: number, dec: Decoration) => {
    if (from < to) ranges.push({ from, to, dec })
  }
  /** Add a zero-width widget decoration (from === to is valid for widgets). */
  const addWidget = (pos: number, dec: Decoration) => {
    ranges.push({ from: pos, to: pos, dec })
  }

  /** Pick the right content decoration based on richFormatting. */
  const c = (key: keyof typeof RICH) => rich ? RICH[key] : FLAT[key]

  /** Pick the right syntax marker based on cursor position. */
  const s = (reveal: boolean) => reveal ? SYN_REV : SYN

  syntaxTree(state).iterate({
    enter(ref: SyntaxNodeRef) {
      const { name, from, to } = ref
      // Materialise the full SyntaxNode (has getChild / getChildren)
      const node = ref.node
      const reveal = cursorInRange(cursors, from, to)

      switch (name) {

        // ── # H1  ## H2  ### H3  #### H4 ─────────────────────────
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4': {
          const level = name.slice(-1)                   // '1' .. '4'
          const hMark = node.getChild('HeaderMark')
          const hDec  = Decoration.mark({ class: `mde-h${level}` })
          const sMark = Decoration.mark({
            class: `mde-syn mde-syn-h${level}${reveal ? ' mde-syn-reveal' : ''}`,
          })
          if (hMark) {
            if (name === 'ATXHeading1' && !rich) {
              // Pretty mode: hide # by default, reveal it only when cursor is on this line
              const prettyClass = reveal ? 'mde-syn mde-syn-reveal' : 'mde-syn mde-syn-pretty'
              add(hMark.from, hMark.to, Decoration.mark({ class: prettyClass }))
            } else {
              add(hMark.from, hMark.to, sMark)
            }
            add(hMark.to, to, hDec)
          } else {
            add(from, to, hDec)
          }
          break
        }

        // ── **bold**  __bold__ ────────────────────────────────────
        case 'StrongEmphasis': {
          const marks = node.getChildren('EmphasisMark')
          if (marks.length >= 2) {
            const open  = marks[0]
            const close = marks[marks.length - 1]
            add(open.from,  open.to,   s(reveal))
            add(open.to,    close.from, c('bold'))
            add(close.from, close.to,  s(reveal))
          } else {
            add(from, to, c('bold'))
          }
          break
        }

        // ── *italic*  _italic_ ────────────────────────────────────
        case 'Emphasis': {
          const marks = node.getChildren('EmphasisMark')
          if (marks.length >= 2) {
            const open  = marks[0]
            const close = marks[marks.length - 1]
            add(open.from,  open.to,   s(reveal))
            add(open.to,    close.from, c('italic'))
            add(close.from, close.to,  s(reveal))
          } else {
            add(from, to, c('italic'))
          }
          break
        }

        // ── `code`  ``code`` ──────────────────────────────────────
        case 'InlineCode': {
          const raw = state.doc.sliceString(from, to)
          const bt  = raw.match(/^`+/)?.[0].length ?? 1
          add(from,      from + bt, s(reveal))
          add(from + bt, to   - bt, c('code'))
          add(to   - bt, to,        s(reveal))
          break
        }

        // ── [text](url) ───────────────────────────────────────────
        case 'Link': {
          const raw   = state.doc.sliceString(from, to)
          const label = node.getChild('LinkLabel')
          const url   = node.getChild('URL')

          // In pretty mode always replace with the anchor widget — even when the
          // cursor is inside. This prevents the link from jumping to raw markdown
          // when clicked, avoiding layout shifts. The dblclick/mousedown handlers
          // in the plugin set the selection over the underlying range so the user
          // can still select-all + retype to edit it.
          if (!rich) {
            let href: string | null = url ? state.doc.sliceString(url.from, url.to).trim() : null
            let labelText: string | null = label ? state.doc.sliceString(label.from, label.to).trim() : null
            if (!href || !labelText) {
              const m = raw.match(/^\s*\[([^\]]+)\]\(\s*([^)]+)\s*\)/)
              if (m) { labelText = labelText ?? m[1]; href = href ?? m[2].trim() }
            }
            if (href && labelText) {
              add(from, to, Decoration.replace({ widget: new LinkWidget(href, labelText, raw) }))
            } else {
              add(from, to, Decoration.mark({ class: 'mde-link' }))
            }
            break
          }

          // Rich mode: show styled marks with bracket/url visibility.
          if (label) {
            const marks = node.getChildren('LinkMark')
            if (marks.length >= 2) {
              const bracketClass = reveal ? 'mde-url-visible' : 'mde-url-hidden'
              add(marks[0].from, marks[0].to, Decoration.mark({ class: bracketClass }))
              add(label.from, label.to, Decoration.mark({ tagName: 'a', class: 'mde-link' }))
              const urlClass = reveal ? 'mde-url-visible' : 'mde-url-hidden'
              add(label.to, to, Decoration.mark({ class: urlClass }))
              if (url && reveal) {
                add(url.from, url.to, Decoration.mark({ class: 'mde-url-visible' }))
              }
            } else {
              add(from, to, Decoration.mark({ class: 'mde-link' }))
            }
          } else {
            add(from, to, Decoration.mark({ class: 'mde-link' }))
          }
          break
        }

        // ── ![alt](src) ───────────────────────────────────────────
        case 'Image': {
          // Use Decoration.widget (not replace) so the raw `![alt](src)` text
          // stays in the DOM and can be selected / edited. The image widget is
          // inserted BEFORE the text; the text itself is marked with
          // `mde-image-raw-text` which CSS hides by default and reveals on hover
          // or selection so the user can click into it and type.
          const rawStr = state.doc.sliceString(from, to)
          const m      = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(rawStr)
          if (m) {
            // Widget inserted at the start position (before the raw text)
            addWidget(from, Decoration.widget({ widget: new ImageWidget(m[2], m[1]), side: -1 }))
            // Mark the raw text — hidden by default, revealed by CSS on hover/selection
            add(from, to, Decoration.mark({ class: 'mde-image-raw-text' }))
          }
          break
        }

        // ── > blockquote ──────────────────────────────────────────
        case 'Blockquote': {
          const qm = node.getChild('QuoteMark')
          if (qm) {
            add(qm.from, qm.to, s(reveal))
            add(qm.to + 1, to, Decoration.mark({ class: 'mde-bq' }))
          } else {
            add(from, to, Decoration.mark({ class: 'mde-bq' }))
          }
          break
        }

        // ── - / * / + / 1. list markers ──────────────────────────
        case 'ListMark': {
          const markerText = state.doc.sliceString(from, to)
          const isUnordered = '-*+'.includes(markerText)
          // Show a styled dot in pretty mode (hide raw marker), but keep the
          // raw '-' / '*' in rich mode. When cursor is inside (reveal) always
          // show the raw syntax instead of the widget.
          if (!rich && isUnordered && !reveal) {
            const indent = (state.doc.lineAt(from).text.match(/^(\s*)/)?.[1].length ?? 0)
            const depth  = Math.floor(indent / 2)
            const space  = state.doc.sliceString(to, to + 1) === ' ' ? 1 : 0
            add(from, to + space, Decoration.replace({ widget: new BulletWidget(depth) }))
          } else {
            add(from, to, s(reveal))
          }
          break
        }

        // ── - [ ] / - [x] task checkboxes ────────────────────────
        case 'TaskMarker': {
          const markerText = state.doc.sliceString(from, to)
          const checked = /\[x\]/i.test(markerText)
          if (reveal) {
            add(from, to, s(true))
          } else {
            add(from, to, Decoration.replace({ widget: new CheckboxWidget(checked, from, to) }))
          }
          break
        }

        // ── whole list block: bullet / ordered / task ─────────────
        // Treat the list as one element. When a cursor is anywhere inside it,
        // render a "+ new" button below the last item. Only the OUTERMOST list
        // gets a button — nested lists (parent chain hits ListItem) are skipped
        // so we don't stack buttons.
        case 'BulletList':
        case 'OrderedList': {
          if (!reveal) break
          if (hasAncestor(node, 'ListItem')) break
          const items = node.getChildren('ListItem')
          const last = items.length ? items[items.length - 1] : null
          const anchor = last ? last.to : to
          const lastLine = state.doc.lineAt(Math.min(Math.max(0, anchor), state.doc.length))
          ranges.push({
            from: lastLine.to,
            to:   lastLine.to,
            dec:  Decoration.widget({
              widget: new ListAddWidget(lastLine.to),
              side: 1,
              block: true,
            }),
          })
          break
        }

        // ── --- / *** horizontal rule ─────────────────────────────
        case 'HorizontalRule': {
          if (rich && !reveal) {
            add(from, to, Decoration.replace({ widget: new HrWidget() }))
          } else {
            add(from, to, s(reveal))
          }
          break
        }

        default: break
      }
    },
  })

  // ─── Fence scanner (state machine, top to bottom) ───────────────────────
  // Opening fence : ```  alone  OR  ```language  (backticks + identifier)
  // Closing fence : ```  alone only (no language text)
  //
  // Rules:
  //  - When closed and we see an opening: store in buffer (pending open)
  //  - When open and we see bare ```:    close the block, clear buffer
  //  - When open and we see ```lang:     prev opening is invalid → red, new open in buffer
  //  - At EOF, anything left in buffer → red
  // ─────────────────────────────────────────────────────────────────────────
  const anyFenceRe   = /^```(\S*)$/   // matches ``` or ```lang (nothing else allowed)
  const closeFenceRe = /^```\s*$/     // bare ``` only (can close)

  interface FenceInfo { lineNum: number; pos: number }
  let pendingOpen: FenceInfo | null = null
  const pairedBlocks: Array<{ open: FenceInfo; close: FenceInfo }> = []
  const errorFences: FenceInfo[] = []

  for (let lineNum = 1; lineNum <= state.doc.lines; lineNum++) {
    const line = state.doc.line(lineNum)
    if (!anyFenceRe.test(line.text)) continue

    const isBare = closeFenceRe.test(line.text)

    if (pendingOpen === null) {
      // Nothing open yet → this is an opening regardless of lang
      pendingOpen = { lineNum, pos: line.from }
    } else if (isBare) {
      // Bare ``` closes the current open block
      pairedBlocks.push({ open: pendingOpen, close: { lineNum, pos: line.from } })
      pendingOpen = null
    } else {
      // ```lang while already open → previous open is broken, this becomes the new open
      errorFences.push(pendingOpen)
      pendingOpen = { lineNum, pos: line.from }
    }
  }

  // Anything still in buffer at EOF is unpaired → error
  if (pendingOpen !== null) errorFences.push(pendingOpen)

  // Apply decorations for valid paired blocks
  for (let blockIdx = 0; blockIdx < pairedBlocks.length; blockIdx++) {
    const { open, close } = pairedBlocks[blockIdx]
    const blockId = String(blockIdx)

    // Extract inner content (lines between open and close, exclusive)
    const innerLines: string[] = []
    for (let n = open.lineNum + 1; n < close.lineNum; n++) {
      innerLines.push(state.doc.line(n).text)
    }
    const blockContent = innerLines.join('\n')

    let lineNum = open.lineNum
    while (lineNum <= close.lineNum) {
      const ln = state.doc.line(lineNum)
      let cls = 'mde-codeblock-line'
      if (lineNum === open.lineNum)  cls += ' mde-codeblock-line-first'
      if (lineNum === close.lineNum) cls += ' mde-codeblock-line-last'
      ranges.push({
        from: ln.from,
        to:   ln.from,
        dec:  Decoration.line({ class: cls, attributes: { 'data-codeblockid': blockId } }),
      })

      // Add copy button widget at end of opening and closing fence lines
      if (lineNum === open.lineNum || lineNum === close.lineNum) {
        const role = lineNum === open.lineNum ? 'open' : 'close'
        ranges.push({
          from: ln.to,
          to:   ln.to,
          dec:  Decoration.widget({
            widget: new CodeBlockCopyWidget(blockContent, role),
            side: 1,
          }),
        })
      }

      lineNum++
    }
  }

  // Mark only the ``` part of error fences in red
  for (const fence of errorFences) {
    ranges.push({
      from: fence.pos,
      to:   fence.pos + 3,
      dec:  Decoration.mark({ class: 'mde-codeblock-error-marker' }),
    })
  }

  // Sort by start pos; for same start, outer (larger) range first.
  ranges.sort((a, b) => a.from !== b.from ? a.from - b.from : b.to - a.to)

  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to, dec } of ranges) {
    try { builder.add(from, to, dec) } catch { /* skip invalid/overlapping */ }
  }
  return builder.finish()
}

// ─── ViewPlugin factory ───────────────────────────────────────────────────

function makePlugin(cfg: DecoConfig) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      private _view: EditorView
      private hoveredLine: HTMLElement | null = null
      private hoveredBlockLines: HTMLElement[] = []
      private selectedLines: Set<HTMLElement> = new Set()
      private boundMouseMove: (e: MouseEvent) => void
      private boundMouseLeave: (e: MouseEvent) => void
      private boundDblClick: (e: MouseEvent) => void
      private boundMouseDown: (e: MouseEvent) => void

      constructor(view: EditorView) {
        this._view = view
        this.decorations = buildDecorations(view, cfg)

        // Mouse hover: add/remove a class on the underlying .cm-line
        this.boundMouseMove = (e: MouseEvent) => {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
          if (pos == null) { this.setHoveredLine(null); return }
          try {
            const dom = view.domAtPos(pos)
            const lineEl = this.findCmLine(dom.node as Node | null)
            this.setHoveredLine(lineEl)
          } catch {
            this.setHoveredLine(null)
          }
        }
        this.boundMouseLeave = () => { this.setHoveredLine(null) }

        view.dom.addEventListener('mousemove', this.boundMouseMove)
        view.dom.addEventListener('mouseleave', this.boundMouseLeave)

        // Double-click on link/image widget -> select underlying raw markdown
        this.boundDblClick = (e: MouseEvent) => {
          const pos = this._view.posAtCoords({ x: e.clientX, y: e.clientY })
          if (pos == null) return
          const line = this._view.state.doc.lineAt(pos)
          const base = line.from
          const text = line.text

          // Look for link under cursor
          const linkRE = /\[([^\]]+)\]\(\s*([^)]+)\s*\)/g
          let m: RegExpExecArray | null
          while ((m = linkRE.exec(text)) !== null) {
            const s = base + m.index
            const epos = s + m[0].length
            if (pos >= s && pos <= epos) {
              this._view.dispatch({ selection: EditorSelection.range(s, epos), scrollIntoView: true })
              this._view.focus()
              e.preventDefault()
              return
            }
          }

          // Look for image under cursor
          const imgRE = /!\[([^\]]*)\]\(([^)]*)\)/g
          while ((m = imgRE.exec(text)) !== null) {
            const s = base + m.index
            const epos = s + m[0].length
            if (pos >= s && pos <= epos) {
              this._view.dispatch({ selection: EditorSelection.range(s, epos), scrollIntoView: true })
              this._view.focus()
              e.preventDefault()
              return
            }
          }
        }
        view.dom.addEventListener('dblclick', this.boundDblClick)

        // Mousedown on widget: move the editor selection into the underlying
        // markdown so the user can immediately select/edit the raw text.
        this.boundMouseDown = (e: MouseEvent) => {
          if (e.button !== 0) return
          const pos = this._view.posAtCoords({ x: e.clientX, y: e.clientY })
          if (pos == null) return
          const line = this._view.state.doc.lineAt(pos)
          const base = line.from
          const text = line.text

          // If clicking inside a link/image markup, move the caret inside
          // the markdown so subsequent dragging or typing edits the raw text.
          const linkRE = /\[([^\]]+)\]\(\s*([^)]+)\s*\)/g
          let m: RegExpExecArray | null
          while ((m = linkRE.exec(text)) !== null) {
            const s = base + m.index
            const epos = s + m[0].length
            if (pos >= s && pos <= epos) {
              this._view.dispatch({ selection: EditorSelection.single(pos), scrollIntoView: true })
              this._view.focus()
              // allow the browser to continue mouse selection
              return
            }
          }

          const imgRE = /!\[([^\]]*)\]\(([^)]*)\)/g
          while ((m = imgRE.exec(text)) !== null) {
            const s = base + m.index
            const epos = s + m[0].length
            if (pos >= s && pos <= epos) {
              this._view.dispatch({ selection: EditorSelection.single(pos), scrollIntoView: true })
              this._view.focus()
              return
            }
          }
        }
        view.dom.addEventListener('mousedown', this.boundMouseDown)

        // Initialize selection-based classes
        this.updateSelectedLines(view)
      }

      // Helper: climb DOM to find the wrapping CM line element
      private findCmLine(node: Node | null): HTMLElement | null {
        let n: Node | null = node
        while (n && n.nodeType === Node.TEXT_NODE) n = (n as HTMLElement).parentElement
        while (n && (!(n as HTMLElement).classList || !(n as HTMLElement).classList.contains('cm-line'))) n = (n as HTMLElement).parentElement
        return (n as HTMLElement) || null
      }

      private setHoveredLine(lineEl: HTMLElement | null) {
        if (this.hoveredLine === lineEl) return
        if (this.hoveredLine) this.hoveredLine.classList.remove('mde-line-hover')
        // Clear previous code-block hover state
        for (const el of this.hoveredBlockLines) el.classList.remove('mde-codeblock-hover')
        this.hoveredBlockLines = []

        this.hoveredLine = lineEl
        if (this.hoveredLine) {
          this.hoveredLine.classList.add('mde-line-hover')
          // If this line belongs to a code block, activate all lines of that block
          const blockId = (this.hoveredLine as HTMLElement).dataset.codeblockid
          if (blockId) {
            const blockEls = this._view.dom.querySelectorAll<HTMLElement>(
              `.cm-line[data-codeblockid="${blockId}"]`
            )
            for (const el of Array.from(blockEls)) {
              el.classList.add('mde-codeblock-hover')
              this.hoveredBlockLines.push(el)
            }
          }
        }
      }

      // Update DOM classes for lines that intersect the selection ranges
      private updateSelectedLines(view: EditorView) {
        const newSet = new Set<HTMLElement>()
        for (const r of view.state.selection.ranges) {
          let pos = r.from
          const end = r.to
          while (pos <= end) {
            const line = view.state.doc.lineAt(pos)
            try {
              const dom = view.domAtPos(line.from)
              const lineEl = this.findCmLine(dom.node as Node | null)
              if (lineEl) newSet.add(lineEl)
            } catch {
              // ignore
            }
            if (line.to >= end) break
            pos = line.to + 1
          }
        }
        // Remove classes that are no longer selected
        for (const el of this.selectedLines) if (!newSet.has(el)) el.classList.remove('mde-line-selected')
        // Add classes for newly selected lines
        for (const el of newSet) if (!this.selectedLines.has(el)) el.classList.add('mde-line-selected')
        this.selectedLines = newSet
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, cfg)
        }
        if (update.selectionSet) this.updateSelectedLines(update.view)
      }

      destroy() {
        try { this._view.dom.removeEventListener('mousemove', this.boundMouseMove) } catch {}
        try { this._view.dom.removeEventListener('mouseleave', this.boundMouseLeave) } catch {}
        try { this._view.dom.removeEventListener('dblclick', this.boundDblClick) } catch {}
        try { this._view.dom.removeEventListener('mousedown', this.boundMouseDown) } catch {}
        try { closeCodeBlockContextMenu() } catch {}
        if (this.hoveredLine) this.hoveredLine.classList.remove('mde-line-hover')
        for (const el of this.hoveredBlockLines) el.classList.remove('mde-codeblock-hover')
        for (const el of this.selectedLines) el.classList.remove('mde-line-selected')
      }
    },
    { decorations: (v) => v.decorations },
  )
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Build the extension set for a given config. Pass to decoConfigCompartment. */
export function makeDecoExtension(cfg: DecoConfig): Extension {
  return makePlugin(cfg)
}

/** Convenience constant for createEditorState initial value. */
export const markdownDecorations: Extension = decoConfigCompartment.of(
  makeDecoExtension(DEFAULT_DECO_CONFIG),
)
