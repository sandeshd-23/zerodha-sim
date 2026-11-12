import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// On GitHub Pages the app lives under /<repo>/ — the deploy workflow sets VITE_BASE.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version} · ${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.ico', 'icons/apple-touch-icon-180x180.png', 'icons/logo.svg'],
      manifest: {
        id: './',
        name: 'Kite Time Machine — Trading Simulator',
        short_name: 'Kite Sim',
        description: '25-year Indian stock market time-machine: practise investing and trading with virtual money, fully offline.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#ffffff',
        background_color: '#f9f9f9',
        categories: ['finance', 'education'],
        icons: [
          { src: 'icons/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only — market data is cached by the engine worker itself (src/worker/dataCache.ts).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        globIgnores: ['data/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/?data\//, /\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5_000_000,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
