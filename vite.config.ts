import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The site already has a fully-configured manifest at
      // public/site.webmanifest (icons, theme_color, lang, scope, etc.).
      // Telling the plugin to NOT generate one keeps the manifest a single
      // source of truth and avoids drift if either side changes shape.
      manifest: false,
      // autoUpdate registers a SW that activates in the background so users
      // never see a "new version available, reload" prompt. For a content
      // site that already prerenders per-event HTML, instant updates matter.
      registerType: 'autoUpdate',
      // Default `inline` is fine for our SPA — the registration snippet ends
      // up in the head, well under CSP's script-src 'self'. We explicitly
      // do NOT enable the SW in dev (workbox + HMR fight each other).
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      workbox: {
        // SPA fallback: any navigation request that doesn't match a precached
        // file falls through to /index.html so React Router can take over.
        // Matches the `rewrites: [{ source: '**', destination: '/index.html' }]`
        // block in firebase.json — the SW won't ever serve a real 404 page.
        navigateFallback: '/index.html',
        // Don't precache index.html itself: every prerendered route already
        // lives at /event/<slug>/index.html and we don't want the SW to short-
        // circuit a fresh navigation to the shell with a stale copy.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2}'],
        globIgnores: ['**/index.html'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
