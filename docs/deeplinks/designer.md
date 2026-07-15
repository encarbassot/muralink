# Deeplink — DESIGNER

The visual block editor. Was `PRESENTATION`; renamed DESIGNER everywhere.

## Block editor

- **Drag blocks** = modules onto a canvas.
- **Draw typed connections** between them = integrations.
- **Connection types:**
  - an **Interceptor action**, or
  - a **direct module-to-module data binding**.
- **Enter a block** to view/edit its code. Multi-language support (any popular
  language + extensible).

## Entity modeler

A visual, SQL-like schema builder:
- Drag-and-connect fields and relations.
- AI assist (optional, token cost shown before use, Ollama substitutable).
- See the generated code per block.

This is the visual face of the parallel SQL-style entity manager described in
[storage-and-git.md](storage-and-git.md).

## Configures the extension overlay

DESIGNER is where the user decides **which widgets appear on which URL patterns**,
draws the connections between them, and sets the data flow. The
`platforms/extension` widget renderer then executes that configuration.

## AI assistant

Inline, optional, token cost shown before use, Ollama substitutable. Never
required — DESIGNER works fully without it.

## Prior art

`🧠/DESIGNER` holds three sub-projects. Consolidate on **`cancas`** — the most
mature canvas/node editor (layer panel, properties, timeline/keyframes, resizable
panels, multi-page). Drop `elioblog` and `elioputo`.

**Do not start building DESIGNER until `packages/types`, `packages/core`, `url`,
and `contacts` are solid** (bootstrap ordering).
