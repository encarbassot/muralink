// Vite config for the Tunnel guest frontend. Resolves @muralink/* to TS source
// (mirroring tsconfig.base.json paths) so no package build step is needed.
// Builds into the Tunnel's public/ dir, which the Tunnel serves at /s/:token.

import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: fromRoot('../../tunnel/public'),
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      { find: '@muralink/app/tunnel', replacement: fromRoot('../../packages/app/src/TunnelApp.tsx') },
      { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
      { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
      { find: '@muralink/shell', replacement: fromRoot('../../packages/shell/src/index.ts') },
      { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
      { find: '@muralink/editor', replacement: fromRoot('../../packages/editor/src/index.ts') },
    ],
  },
  server: {
    port: 6200,
  },
})
