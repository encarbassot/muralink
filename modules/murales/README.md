# murales

Digital pinboards. A mural is a hybrid between a markdown document and a free
grid: it reads top-to-bottom like a document, but any element can be pinned to
a fractional grid position, and the whole thing is built to be shared by link.

Use cases: instructions plus files for a friend, a delivery route with notes
per stop, vacation photos, contacts with annotations, a small landing page.

## Model

One `YMural` document per mural (see `types.ts`): an ordered `elements[]` array
plus a `grid` config. Element kinds:

- `markdown` — a chunk of markdown, edited in place (Obsidian style) with the
  notes module's CodeMirror editor.
- `file` — a file stored on the orchester NAS under `murales/<muralId>/`.
- `mural-ref` — reserved (fase 2): embeds/links another mural.

Placement is `flow` (vertical document order) or `absolute` (`abs: {x, y, w, h?}`
in fractional column/row units on the 0.5 lattice — `x: 2.5` is the middle of
the 3rd column). The grid starts locked at 5 columns; unlocking only grows the
render extents (`extendLeft/Right/Up`), the canonical origin stays at (0,0), so
re-locking never rewrites data.

## Cross-mural references (fase 2 groundwork)

Standard markdown links with an internal scheme:

- `[Texto](mural://<muralId>)` — link to a mural.
- `[Bloque](mural://<muralId>#<elementId>)` — link to a specific element.

Element ids are stable; do not regenerate them on edit.

## Sharing

The mural's `public` flag records owner intent. Enforcement lives in the tunnel
share (`kind: 'mural'`): non-public murals require any signed-in tunnel account,
public ones open without login. Files ride the existing storage relay because
the share's root path is the mural's folder.
