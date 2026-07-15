import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Library build for `@muralink/embed`. Bundles the embed surface plus all its
// `@muralink/*` workspace deps into a single ESM file, keeping React external so
// the host app (e.g. BikeHunter's Vite/React 19) provides the one React copy.
// Output: dist/index.js + dist/theme.css. Consumers alias `@muralink/embed` at it.
//   npm run build   (from packages/embed)
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      // Host supplies React — never bundle it (avoids duplicate-React / invalid
      // hook call). Everything else (@muralink/*) is bundled inline.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    },
  },
})
