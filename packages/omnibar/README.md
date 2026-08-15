# @muralink/omnibar

The command surface: one input that searches widgets, runs small tools, and
falls back to creating a note out of whatever you typed. It is the "add
something" gesture everywhere in the product.

```tsx
<Omnibar
  context={{ text: selection, source: 'selection' }}
  modules={[translateModule]}
  renderDefaultResults={(query) => /* the host decides what a result is */}
  onInject={(value) => /* the host decides what to do with a result */}
  onClose={close}
/>
```

## What lives here

- **[src/Omnibar.tsx](src/Omnibar.tsx)** — the component: input row, context
  chip, module activation, keyboard handling.
- **[src/types.ts](src/types.ts)** — `OmnibarContext`, `OmnibarModule`,
  `ModuleRenderProps`.
- **[src/modules/translate/](src/modules/translate/)** — the reference module,
  and the proof the plug-in shape is real.
- **[src/omnibar.css](src/omnibar.css)** — styles, written against the host's
  theme tokens (`--bg`, `--fg`, `--accent`…), so the bar inherits whatever
  surface it is dropped into.

## Rules

- **The core never reads the environment.** It does not touch `window`,
  `chrome`, or the current selection. The host captures context and passes it
  in — that is what lets the same bar run in the web app, in Electron, and in a
  browser extension.
- **The host owns the result.** `onInject` hands a value back; whether that
  becomes a clipboard write, a new widget, or an insertion is not the bar's
  business.
- The stylesheet is imported by the component. A build that drops CSS side
  effects renders the bar unstyled — as a block in the page flow rather than a
  centred overlay.
