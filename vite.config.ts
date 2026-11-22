import { defineConfig } from 'vite';

// Relative base so dist/ works from any folder / simple static server (and even
// most file-hosting setups). No CDN, everything is bundled.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // keep fonts as real files (better caching on the booth PC)
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
  preview: { host: true },
});
