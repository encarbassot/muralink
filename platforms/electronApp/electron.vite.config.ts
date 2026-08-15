// electron-vite config — three independent builds: main (Node), preload (Node
// bridge), renderer (React, same Vite stack as platforms/web). The @muralink/types
// alias mirrors platforms/web/vite.config.ts so we reuse the shared contract
// without a package build step. All data is local; no network in v1.

import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, 'src/preload/index.ts') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      // Array form (like platforms/web) so subpath aliases resolve in order —
      // '@muralink/module-notes/web' must be tried before '@muralink/module-notes'.
      alias: [
        { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
        { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
        { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
        { find: '@muralink/editor', replacement: fromRoot('../../packages/editor/src/index.ts') },
        { find: '@muralink/shell', replacement: fromRoot('../../packages/shell/src/index.ts') },
        { find: '@muralink/spaces', replacement: fromRoot('../../packages/spaces/src/index.ts') },
        { find: '@muralink/module-notes/web', replacement: fromRoot('../../modules/notes/implementations/web/index.ts') },
        { find: '@muralink/module-notes/types', replacement: fromRoot('../../modules/notes/types.ts') },
        { find: '@muralink/module-notes', replacement: fromRoot('../../modules/notes/manifest.ts') },
        { find: '@muralink/module-contacts/web', replacement: fromRoot('../../modules/contacts/implementations/web/index.ts') },
        { find: '@muralink/module-contacts/types', replacement: fromRoot('../../modules/contacts/types.ts') },
        { find: '@muralink/module-contacts', replacement: fromRoot('../../modules/contacts/manifest.ts') },
        { find: '@muralink/module-expenses/web', replacement: fromRoot('../../modules/expenses/implementations/web/index.ts') },
        { find: '@muralink/module-expenses/cell', replacement: fromRoot('../../modules/expenses/cell.tsx') },
        { find: '@muralink/module-expenses/types', replacement: fromRoot('../../modules/expenses/types.ts') },
        { find: '@muralink/module-expenses', replacement: fromRoot('../../modules/expenses/manifest.ts') },
        { find: '@', replacement: resolve(__dirname, 'src/renderer') },
      ],
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
