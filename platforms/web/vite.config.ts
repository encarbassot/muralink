// Vite config for the web platform. Resolves @muralink/* to TS source (mirroring
// tsconfig.base.json paths) so no package build step is needed. Tailwind v4 +
// PWA. All data is local — the SW just precaches the app shell for offline.

import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Mural',
        short_name: 'Mural',
        description: 'Local-first OS in the browser. Your modules, your data, offline.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
      { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
      { find: '@muralink/shell', replacement: fromRoot('../../packages/shell/src/index.ts') },
      { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
      { find: '@muralink/module-calendar/web', replacement: fromRoot('../../modules/calendar/implementations/web/index.ts') },
      { find: '@muralink/module-calendar/types', replacement: fromRoot('../../modules/calendar/types.ts') },
      { find: '@muralink/module-calendar', replacement: fromRoot('../../modules/calendar/manifest.ts') },
      { find: '@muralink/module-contacts/web', replacement: fromRoot('../../modules/contacts/implementations/web/index.ts') },
      { find: '@muralink/module-contacts/types', replacement: fromRoot('../../modules/contacts/types.ts') },
      { find: '@muralink/module-contacts', replacement: fromRoot('../../modules/contacts/manifest.ts') },
      { find: '@muralink/module-appointments/web', replacement: fromRoot('../../modules/appointments/implementations/web/index.ts') },
      { find: '@muralink/module-appointments/types', replacement: fromRoot('../../modules/appointments/types.ts') },
      { find: '@muralink/module-appointments', replacement: fromRoot('../../modules/appointments/manifest.ts') },
      { find: '@muralink/module-stock/web', replacement: fromRoot('../../modules/stock/implementations/web/index.ts') },
      { find: '@muralink/module-stock/types', replacement: fromRoot('../../modules/stock/types.ts') },
      { find: '@muralink/module-stock', replacement: fromRoot('../../modules/stock/manifest.ts') },
      { find: '@muralink/module-notes/web', replacement: fromRoot('../../modules/notes/implementations/web/index.ts') },
      { find: '@muralink/module-notes/cell', replacement: fromRoot('../../modules/notes/cell.tsx') },
      { find: '@muralink/module-notes/types', replacement: fromRoot('../../modules/notes/types.ts') },
      { find: '@muralink/module-notes', replacement: fromRoot('../../modules/notes/manifest.ts') },
      { find: '@hair-saloon/instance/config', replacement: fromRoot('../../instances/hair-saloon/config.ts') },
      { find: '@hair-saloon/instance/theme', replacement: fromRoot('../../instances/hair-saloon/theme.ts') },
      { find: '@hair-saloon/instance', replacement: fromRoot('../../instances/hair-saloon/modules.ts') },
    ],
  },
  server: {
    port: 6100,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
