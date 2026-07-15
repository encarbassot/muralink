import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BikeHunter host simulation. Run from the repo root:
//   npx vite --config examples/rails-host-sim/vite.config.ts
// With the core server up (ELIO_API_TOKEN=dev-token, :3001), the "Servidor"
// space works end-to-end.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 4310 },
  build: { outDir: 'dist' },
})
