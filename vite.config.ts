import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The build's own commit, injected at build time (beat 011, FR-001).
 *
 * "Byte-identical replay" is a promise about the same code, so a manifest has to say which
 * code it came from. A build outside a checkout says so rather than pretending to a version:
 * `unknown` never equals anything, so such a manifest always warns on import, which is the
 * honest behaviour.
 */
function codeVersion(): string {
  if (process.env['J_OCEAN_CODE_VERSION'] !== undefined) return process.env['J_OCEAN_CODE_VERSION'];
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${commit}+edits` : commit;
  } catch {
    return 'unknown';
  }
}

// NFR-02: j-ocean builds to static assets and the demo is a URL. A relative base means
// the built site works from any path on any static host without configuration.
export default defineConfig({
  base: './',
  define: { __CODE_VERSION__: JSON.stringify(codeVersion()) },
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
});
