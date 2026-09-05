import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NFR-02: j-ocean builds to static assets and the demo is a URL. A relative base means
// the built site works from any path on any static host without configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
});
