/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * The single place the deploy path is defined. GitHub Pages serves a project
 * site at https://<user>.github.io/<repo>/, so this must be "/<repo>/".
 * If you rename the repository, change this constant (or set BASE_PATH in CI).
 */
export const REPO_BASE = '/posedge/';

const base = process.env.BASE_PATH || REPO_BASE;

// Domain tests assert local-time behaviour across DST, so pin the zone for Vitest workers.
if (process.env.VITEST) process.env.TZ = 'America/Los_Angeles';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // scope and start_url are derived from `base` by the plugin.
      manifest: {
        name: 'Posedge',
        short_name: 'Posedge',
        description: 'Plan your weeks, track every project, and remember what you study.',
        theme_color: '#0B0D12',
        background_color: '#0B0D12',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
