import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fish Cold Storage Booking',
        short_name: 'చిల్ బాక్స్',
        description:
          'Community solar chill-box booking for Nizampatnam Harbour fishermen.',
        theme_color: '#FAF7F0',
        background_color: '#FAF7F0',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'te',
        start_url: '/',
        scope: '/',
        categories: ['utilities', 'navigation'],
        icons: [
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
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
