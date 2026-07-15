import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
      { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
      { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
    ],
  },
  server: {
    port: 6200,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
