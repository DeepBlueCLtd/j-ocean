import { defineConfig } from 'vitest/config';

// Principle III: the headless suite runs in Node with no DOM. The shell is tested by
// Playwright against the built site (tests/shell), never by a simulated DOM here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/shell/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30_000,
  },
});
