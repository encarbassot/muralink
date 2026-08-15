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
        // The app bundle passed workbox's 2 MiB default as modules grew.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@muralink/types', replacement: fromRoot('../../packages/types/src/index.ts') },
      { find: '@muralink/core', replacement: fromRoot('../../packages/core/src/index.ts') },
      { find: '@muralink/shell', replacement: fromRoot('../../packages/shell/src/index.ts') },
      { find: '@muralink/omnibar', replacement: fromRoot('../../packages/omnibar/src/index.ts') },
      { find: '@muralink/ui', replacement: fromRoot('../../packages/ui/src/index.ts') },
      { find: '@muralink/editor', replacement: fromRoot('../../packages/editor/src/index.ts') },
      { find: '@muralink/module-calendar/web', replacement: fromRoot('../../modules/calendar/implementations/web/index.ts') },
      { find: '@muralink/module-calendar/types', replacement: fromRoot('../../modules/calendar/types.ts') },
      { find: '@muralink/module-calendar', replacement: fromRoot('../../modules/calendar/manifest.ts') },
      { find: '@muralink/module-contacts/web', replacement: fromRoot('../../modules/contacts/implementations/web/index.ts') },
      { find: '@muralink/module-contacts/types', replacement: fromRoot('../../modules/contacts/types.ts') },
      { find: '@muralink/module-contacts', replacement: fromRoot('../../modules/contacts/manifest.ts') },
      { find: '@muralink/module-expenses/web', replacement: fromRoot('../../modules/expenses/implementations/web/index.ts') },
      { find: '@muralink/module-expenses/cell', replacement: fromRoot('../../modules/expenses/cell.tsx') },
      { find: '@muralink/module-expenses/types', replacement: fromRoot('../../modules/expenses/types.ts') },
      { find: '@muralink/module-expenses', replacement: fromRoot('../../modules/expenses/manifest.ts') },
      { find: '@muralink/module-stock/web', replacement: fromRoot('../../modules/stock/implementations/web/index.ts') },
      { find: '@muralink/module-stock/types', replacement: fromRoot('../../modules/stock/types.ts') },
      { find: '@muralink/module-stock', replacement: fromRoot('../../modules/stock/manifest.ts') },
      { find: '@muralink/module-notes/web', replacement: fromRoot('../../modules/notes/implementations/web/index.ts') },
      { find: '@muralink/module-notes/cell', replacement: fromRoot('../../modules/notes/cell.tsx') },
      { find: '@muralink/module-notes/types', replacement: fromRoot('../../modules/notes/types.ts') },
      { find: '@muralink/module-notes', replacement: fromRoot('../../modules/notes/manifest.ts') },
      { find: '@muralink/module-maps/web', replacement: fromRoot('../../modules/maps/implementations/web/index.ts') },
      { find: '@muralink/module-maps/cell', replacement: fromRoot('../../modules/maps/cell.tsx') },
      { find: '@muralink/module-maps', replacement: fromRoot('../../modules/maps/manifest.ts') },
      { find: '@muralink/module-mail/web', replacement: fromRoot('../../modules/mail/implementations/web/index.ts') },
      { find: '@muralink/module-mail/cell', replacement: fromRoot('../../modules/mail/cell.tsx') },
      { find: '@muralink/module-mail/types', replacement: fromRoot('../../modules/mail/types.ts') },
      { find: '@muralink/module-mail', replacement: fromRoot('../../modules/mail/manifest.ts') },
      { find: '@muralink/module-murales/web', replacement: fromRoot('../../modules/murales/implementations/web/index.ts') },
      { find: '@muralink/module-murales/cell', replacement: fromRoot('../../modules/murales/cell.tsx') },
      { find: '@muralink/module-murales/types', replacement: fromRoot('../../modules/murales/types.ts') },
      { find: '@muralink/module-murales', replacement: fromRoot('../../modules/murales/manifest.ts') },
      // Which instance this build *is*. Repoint these three at another folder
      // under instances/ to build that deployment instead.
      { find: '@instance/config', replacement: fromRoot('../../instances/default/config.ts') },
      { find: '@instance/theme', replacement: fromRoot('../../instances/default/theme.ts') },
      { find: '@instance', replacement: fromRoot('../../instances/default/modules.ts') },
    ],
  },
  server: {
    port: 6100,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
