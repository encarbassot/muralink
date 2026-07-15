import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds the standalone iframe host. Run from packages/embed:
//   npm run host:dev     — dev server
//   npm run host:build   — static bundle in host/dist, deploy anywhere
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 4300 },
  build: { outDir: 'dist' },
})
