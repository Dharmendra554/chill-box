// vitest's re-export, so the `test` block below is typed. Same defineConfig.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages serves the app from /<repo>/, every other host from /.
 * BASE_PATH is set by the deploy workflow; local dev and root-served hosts
 * need nothing. The PWA scope has to match, or the service worker refuses
 * to control the page.
 */
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  /**
   * The unit tests cover the harbour rules on one device, so they must run
   * the local path whether or not the developer has a `.env.local`. Vitest
   * loads those files like any other build, so without this the suite would
   * pass on a machine with no Firebase keys and fail on one with them — and
   * the shared-database paths are verified in the browser against a real
   * project, not here.
   */
  test: {
    env: {
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_DATABASE_URL: '',
      VITE_FIREBASE_PROJECT_ID: '',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chill-Box · Harbour cold storage',
        short_name: 'చిల్ బాక్స్',
        description:
          'Community solar chill-box booking for Andhra Pradesh fishing harbours.',
        theme_color: '#FAF7F0',
        background_color: '#FAF7F0',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'te',
        start_url: base,
        scope: base,
        categories: ['utilities', 'navigation'],
        icons: [
          {
            src: `${base}icon.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: `${base}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: `${base}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/marine-api\.open-meteo\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'marine-swell',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 30 },
            },
          },
          {
            // Sea chart tiles: cache-first, so a route drawn once still
            // draws on the way back in with no signal.
            urlPattern: /^https:\/\/(tile\.openstreetmap\.org|tiles\.openseamap\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sea-chart-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
