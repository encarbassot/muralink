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
      alias: {
        '@muralink/types': fromRoot('../../packages/types/src/index.ts'),
        '@muralink/ui': fromRoot('../../packages/ui/src/index.ts'),
        '@muralink/shell': fromRoot('../../packages/shell/src/index.ts'),
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
