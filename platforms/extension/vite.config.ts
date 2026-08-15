// Vite config for the Chromium extension side panel. MV3 pages cannot load
// from a dev server (CSP forbids remote script) — the dev loop is
// `vite build --watch` + "Reload" in chrome://extensions. `base: ''` is
// mandatory so asset URLs are relative under chrome-extension://.
// Aliases resolve @muralink/* to TS source (array form: subpaths BEFORE the
// bare package, matching order matters — see electronApp's config).

import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fromRoot('sidepanel.html'),
    },
  },
  resolve: {
    alias: [
      { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
      { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
      { find: '@muralink/shell', replacement: fromRoot('../../packages/shell/src/index.ts') },
      { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
      { find: '@muralink/editor', replacement: fromRoot('../../packages/editor/src/index.ts') },
      { find: '@muralink/spaces', replacement: fromRoot('../../packages/spaces/src/index.ts') },
      { find: '@muralink/module-notes/web', replacement: fromRoot('../../modules/notes/implementations/web/index.ts') },
      { find: '@muralink/module-notes/types', replacement: fromRoot('../../modules/notes/types.ts') },
      { find: '@muralink/module-notes', replacement: fromRoot('../../modules/notes/manifest.ts') },
      { find: '@muralink/module-calendar/web', replacement: fromRoot('../../modules/calendar/implementations/web/index.ts') },
      { find: '@muralink/module-calendar/types', replacement: fromRoot('../../modules/calendar/types.ts') },
      { find: '@muralink/module-calendar', replacement: fromRoot('../../modules/calendar/manifest.ts') },
    ],
  },
})
